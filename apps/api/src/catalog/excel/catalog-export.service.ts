import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { fromMilli, toMilli } from '@mebel/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { COLUMN_HELP, PRODUCT_COLUMNS, SHEET_NAME, VARIANT_COLUMNS } from './excel-format.js';

const qty = (d: Prisma.Decimal | null) => (d === null ? '' : Number(fromMilli(toMilli(d.toString())!)));

/**
 * Import formatidagi to'liq katalog. Eksport → tahrirlash → import qilish mumkin.
 */
@Injectable()
export class CatalogExportService {
  constructor(private readonly prisma: PrismaService) {}

  async export(): Promise<Buffer> {
    const [variants, groups] = await Promise.all([
      this.prisma.productVariant.findMany({
        orderBy: [{ product: { code: 'asc' } }, { sku: 'asc' }],
        include: {
          product: { include: { category: { select: { slug: true } }, brand: { select: { name: true } } } },
          priceTiers: { orderBy: { minQty: 'asc' } },
          groupPrices: true,
        },
      }),
      this.prisma.priceGroup.findMany({ orderBy: { name: 'asc' } }),
    ]);

    const attrKeys = [
      ...new Set(variants.flatMap((v) => Object.keys((v.attributes ?? {}) as Record<string, unknown>))),
    ].sort();
    const maxTiers = Math.max(0, ...variants.map((v) => v.priceTiers.length));
    const columns = [
      ...PRODUCT_COLUMNS,
      ...VARIANT_COLUMNS,
      ...attrKeys.map((k) => `attr:${k}`),
      ...groups.map((g) => `group:${g.name}`),
      ...Array.from({ length: Math.max(maxTiers, 2) }, (_, i) => [`tier${i + 1}_qty`, `tier${i + 1}_price`]).flat(),
    ];

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
    sheet.columns = columns.map((c) => ({ header: c, key: c, width: Math.max(12, c.length + 2) }));
    sheet.getRow(1).font = { bold: true };
    sheet.getColumn('name_uz').width = 36;
    sheet.getColumn('name_ru').width = 36;

    for (const v of variants) {
      const p = v.product;
      const row: Record<string, string | number> = {
        product_code: p.code ?? `P-${p.id.slice(0, 8)}`,
        category_slug: p.category.slug,
        brand: p.brand?.name ?? '',
        name_uz: p.nameUz,
        name_ru: p.nameRu,
        unit: p.unit,
        kind: p.kind,
        min_qty: qty(p.minQty),
        qty_step: qty(p.qtyStep),
        weight_kg: qty(p.weightKg),
        volume_m3: p.volumeM3?.toNumber() ?? '',
        board_length_mm: p.boardLengthMm ?? '',
        board_width_mm: p.boardWidthMm ?? '',
        thickness_mm: p.thicknessMm?.toNumber() ?? '',
        sku: v.sku,
        price: Number(v.basePrice),
        stock: qty(v.stockQty),
        low_stock: qty(v.lowStockThreshold),
        on_order: v.availability === 'ON_ORDER' ? 'ha' : 'yo\'q',
        lead_time_days: v.leadTimeDays ?? '',
        active: v.isActive ? 'ha' : 'yo\'q',
      };
      const attrs = (v.attributes ?? {}) as Record<string, string | number>;
      for (const k of attrKeys) row[`attr:${k}`] = attrs[k] ?? '';
      for (const g of groups) {
        const gp = v.groupPrices.find((x) => x.priceGroupId === g.id);
        row[`group:${g.name}`] = gp ? Number(gp.price) : '';
      }
      v.priceTiers.forEach((t, i) => {
        row[`tier${i + 1}_qty`] = qty(t.minQty);
        row[`tier${i + 1}_price`] = Number(t.price);
      });
      sheet.addRow(row);
    }

    const help = wb.addWorksheet('Yo\'riqnoma');
    help.columns = [
      { header: 'Ustun', key: 'col', width: 28 },
      { header: 'Tavsif', key: 'desc', width: 100 },
    ];
    help.getRow(1).font = { bold: true };
    for (const [col, desc] of Object.entries(COLUMN_HELP)) help.addRow({ col, desc });

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
