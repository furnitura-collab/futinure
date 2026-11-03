import { HttpStatus, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { fromMilli, toMilli, type ProductKind, type Unit } from '@mebel/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { AppException } from '../../common/app-exception.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthUser } from '../../auth/decorators.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  MAX_ROWS,
  PRODUCT_COLUMNS,
  REQUIRED_COLUMNS,
  SHEET_NAME,
  VARIANT_COLUMNS,
  attrValue,
  cellText,
  parseBool,
  parseDecimal,
  parseInt0,
  parseKind,
  parseMoney,
  parseQty,
  parseUnit,
  stableJson,
  type Parsed,
} from './excel-format.js';

export interface ImportIssue {
  row: number;
  column?: string;
  message: string;
}

interface ProductData {
  categorySlug: string;
  brand: string | null;
  nameUz: string;
  nameRu: string;
  unit: Unit;
  kind: ProductKind;
  minQty: string;
  qtyStep: string;
  weightKg: string | null;
  volumeM3: number | null;
  boardLengthMm: number | null;
  boardWidthMm: number | null;
  thicknessMm: number | null;
}

interface VariantRow {
  row: number;
  sku: string;
  basePrice: bigint;
  attributes: Record<string, string | number>;
  /** null — ustun bo'sh, qoldiq o'zgarmaydi */
  stock: string | null;
  lowStock: string | null;
  onOrder: boolean | null;
  leadTimeDays: number | null;
  isActive: boolean;
  /** undefined — faylda tier ustunlari yo'q, pog'onalarga tegilmaydi */
  tiers: { minQty: string; price: bigint }[] | undefined;
  /** guruh nomi → narx (null = o'chirish). Faqat faylda bor guruh ustunlari */
  groupPrices: Map<string, bigint | null>;
}

interface ProductPlan {
  code: string;
  row: number;
  data: ProductData;
  variants: VariantRow[];
}

export interface ImportResult {
  committed: boolean;
  rows: number;
  summary: {
    productsCreated: number;
    productsUpdated: number;
    variantsCreated: number;
    variantsUpdated: number;
    priceChanges: number;
    stockChanges: number;
    brandsCreated: string[];
  };
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

type Header = Map<string, number>;

/**
 * Excel'dan katalog import. Avval dry-run (commit=false) — nima o'zgarishini ko'rsatadi.
 * Kamida bitta xato bo'lsa hech narsa saqlanmaydi (hammasi yoki hech narsa).
 */
@Injectable()
export class CatalogImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async import(buffer: Buffer, commit: boolean, actor: AuthUser): Promise<ImportResult> {
    const sheet = await this.readSheet(buffer);
    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];

    const header = this.readHeader(sheet, errors);
    if (errors.length) return this.result(false, 0, errors, warnings);

    const plans = this.parseRows(sheet, header, errors, warnings);
    const rowCount = Math.max(0, sheet.actualRowCount - 1);
    if (errors.length) return this.result(false, rowCount, errors, warnings);

    const ctx = await this.loadContext(plans);
    const diff = this.diff(plans, ctx, header, errors, warnings);
    if (errors.length || !commit) return this.result(false, rowCount, errors, warnings, diff.summary);

    await this.apply(plans, ctx, diff, actor);
    return this.result(true, rowCount, errors, warnings, diff.summary);
  }

  // ───────────── O'qish ─────────────

  private async readSheet(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new AppException('INVALID_FILE', 'Fayl .xlsx formatida emas', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const sheet = wb.getWorksheet(SHEET_NAME) ?? wb.worksheets[0];
    if (!sheet) throw new AppException('INVALID_FILE', 'Faylda varaq yo\'q', HttpStatus.UNPROCESSABLE_ENTITY);
    if (sheet.actualRowCount - 1 > MAX_ROWS) {
      throw new AppException('TOO_MANY_ROWS', `Maksimum ${MAX_ROWS} qator`, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    return sheet;
  }

  private readHeader(sheet: ExcelJS.Worksheet, errors: ImportIssue[]): Header {
    const header: Header = new Map();
    sheet.getRow(1).eachCell((cell, col) => {
      const raw = cellText(cell.value);
      // attr: va group: dan keyingi qism registrini saqlaymiz (attr:color, group:Usta)
      const name = raw.includes(':') ? raw.replace(/^[^:]+/, (p) => p.toLowerCase().trim()) : raw.toLowerCase();
      if (name) header.set(name, col);
    });
    for (const col of REQUIRED_COLUMNS) {
      if (!header.has(col)) errors.push({ row: 1, column: col, message: 'Majburiy ustun yo\'q' });
    }
    return header;
  }

  private parseRows(sheet: ExcelJS.Worksheet, header: Header, errors: ImportIssue[], warnings: ImportIssue[]) {
    const known = new Set<string>([...PRODUCT_COLUMNS, ...VARIANT_COLUMNS]);
    const attrCols = [...header.keys()].filter((k) => k.startsWith('attr:'));
    const groupCols = [...header.keys()].filter((k) => k.startsWith('group:'));
    const tierNums = [...header.keys()]
      .map((k) => /^tier(\d+)_qty$/.exec(k)?.[1])
      .filter((n): n is string => !!n)
      .sort((a, b) => Number(a) - Number(b));
    for (const k of header.keys()) {
      if (!known.has(k) && !k.startsWith('attr:') && !k.startsWith('group:') && !/^tier\d+_(qty|price)$/.test(k)) {
        warnings.push({ row: 1, column: k, message: 'Noma\'lum ustun, e\'tiborsiz qoldiriladi' });
      }
    }

    const plans = new Map<string, ProductPlan>();
    const seenSku = new Map<string, number>();

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const get = (col: string) => {
        const idx = header.get(col);
        return idx ? cellText(row.getCell(idx).value) : '';
      };
      if ([...header.keys()].every((c) => get(c) === '')) return; // bo'sh qator

      const rowErrors: ImportIssue[] = [];
      const need = <T>(col: string, parsed: Parsed<T>): T | undefined => {
        if (parsed.ok) return parsed.value;
        rowErrors.push({ row: rowNumber, column: col, message: parsed.error });
        return undefined;
      };
      const required = (col: string) => {
        const v = get(col);
        if (!v) rowErrors.push({ row: rowNumber, column: col, message: 'Bo\'sh bo\'lmasligi kerak' });
        return v;
      };
      const optional = <T>(col: string, parse: (s: string) => Parsed<T>): T | null => {
        const v = get(col);
        return v === '' ? null : (need(col, parse(v)) ?? null);
      };

      const code = required('product_code');
      const sku = required('sku');
      const data: ProductData = {
        categorySlug: required('category_slug').toLowerCase(),
        brand: get('brand') || null,
        nameUz: required('name_uz'),
        nameRu: required('name_ru'),
        unit: need('unit', parseUnit(required('unit'))) ?? 'PIECE',
        kind: optional('kind', parseKind) ?? 'GOODS',
        minQty: optional('min_qty', parseQty) ?? '1',
        qtyStep: optional('qty_step', parseQty) ?? '1',
        weightKg: optional('weight_kg', parseQty),
        volumeM3: optional('volume_m3', (s) => parseDecimal(s, 4, 100)),
        boardLengthMm: optional('board_length_mm', (s) => parseInt0(s, 10_000)),
        boardWidthMm: optional('board_width_mm', (s) => parseInt0(s, 10_000)),
        thicknessMm: optional('thickness_mm', (s) => parseDecimal(s, 1, 200)),
      };
      if (toMilli(data.minQty) === 0) rowErrors.push({ row: rowNumber, column: 'min_qty', message: '0 dan katta bo\'lishi kerak' });
      if (toMilli(data.qtyStep) === 0) rowErrors.push({ row: rowNumber, column: 'qty_step', message: '0 dan katta bo\'lishi kerak' });
      if (data.kind === 'BOARD' && (data.boardLengthMm === null || data.boardWidthMm === null)) {
        rowErrors.push({ row: rowNumber, column: 'board_length_mm', message: 'Plita uchun uzunlik va en majburiy' });
      }

      const attributes: Record<string, string | number> = {};
      for (const col of attrCols) {
        const v = get(col);
        if (v !== '') attributes[col.slice(5)] = attrValue(v);
      }

      let tiers: VariantRow['tiers'];
      if (tierNums.length) {
        tiers = [];
        for (const n of tierNums) {
          const qty = get(`tier${n}_qty`);
          const price = get(`tier${n}_price`);
          if (!qty && !price) continue;
          if (!qty || !price) {
            rowErrors.push({ row: rowNumber, column: `tier${n}_qty`, message: 'Miqdor va narx birga to\'ldirilishi kerak' });
            continue;
          }
          const q = need(`tier${n}_qty`, parseQty(qty));
          const p = need(`tier${n}_price`, parseMoney(price));
          if (q !== undefined && p !== undefined) tiers.push({ minQty: q, price: p });
        }
        if (new Set(tiers.map((t) => t.minQty)).size !== tiers.length) {
          rowErrors.push({ row: rowNumber, column: 'tier1_qty', message: 'Pog\'ona miqdorlari takrorlanmasligi kerak' });
        }
      }

      const groupPrices = new Map<string, bigint | null>();
      for (const col of groupCols) {
        const v = get(col);
        groupPrices.set(col.slice(6), v === '' ? null : (need(col, parseMoney(v)) ?? null));
      }

      const variant: VariantRow = {
        row: rowNumber,
        sku,
        basePrice: need('price', parseMoney(required('price'))) ?? 0n,
        attributes,
        stock: optional('stock', parseQty),
        lowStock: optional('low_stock', parseQty),
        onOrder: optional('on_order', parseBool),
        leadTimeDays: optional('lead_time_days', (s) => parseInt0(s, 365)),
        isActive: optional('active', parseBool) ?? true,
        tiers,
        groupPrices,
      };

      if (sku) {
        const key = sku.toUpperCase();
        const first = seenSku.get(key);
        if (first) rowErrors.push({ row: rowNumber, column: 'sku', message: `SKU ${first}-qatorda ham bor` });
        else seenSku.set(key, rowNumber);
      }

      if (rowErrors.length) {
        errors.push(...rowErrors);
        return;
      }

      const existing = plans.get(code);
      if (!existing) {
        plans.set(code, { code, row: rowNumber, data, variants: [variant] });
        return;
      }
      if (stableJson(existing.data) !== stableJson(data)) {
        errors.push({
          row: rowNumber,
          column: 'product_code',
          message: `"${code}" mahsulot maydonlari ${existing.row}-qatordagidan farq qiladi (nom, birlik, kategoriya va h.k. bir xil bo'lishi kerak)`,
        });
        return;
      }
      existing.variants.push(variant);
    });

    return [...plans.values()];
  }

  // ───────────── Bazadagi holat bilan solishtirish ─────────────

  private async loadContext(plans: ProductPlan[]) {
    const skus = plans.flatMap((p) => p.variants.map((v) => v.sku));
    const [categories, brands, groups, products, variants] = await Promise.all([
      this.prisma.category.findMany({ select: { id: true, slug: true } }),
      this.prisma.brand.findMany({ select: { id: true, name: true } }),
      this.prisma.priceGroup.findMany({ select: { id: true, name: true } }),
      this.prisma.product.findMany({ where: { code: { in: plans.map((p) => p.code) } } }),
      this.prisma.productVariant.findMany({
        where: { sku: { in: skus, mode: 'insensitive' } },
        include: { product: true, priceTiers: true, groupPrices: true },
      }),
    ]);
    const productByCode = new Map(products.map((p) => [p.code!, p]));
    const variantBySku = new Map(variants.map((v) => [v.sku.toUpperCase(), v]));

    // Kodsiz mahsulot (admin panelda yaratilgan): SKU orqali topib, fayldagi kodni beramiz
    for (const plan of plans) {
      if (productByCode.has(plan.code)) continue;
      const adopted = plan.variants
        .map((v) => variantBySku.get(v.sku.toUpperCase())?.product)
        .find((p) => p && p.code === null);
      if (adopted) productByCode.set(plan.code, adopted);
    }

    return {
      categoryBySlug: new Map(categories.map((c) => [c.slug, c.id])),
      brandByName: new Map(brands.map((b) => [b.name.toLowerCase(), b.id])),
      groupByName: new Map(groups.map((g) => [g.name.toLowerCase(), g.id])),
      productByCode,
      variantBySku,
    };
  }

  private diff(
    plans: ProductPlan[],
    ctx: Awaited<ReturnType<CatalogImportService['loadContext']>>,
    header: Header,
    errors: ImportIssue[],
    warnings: ImportIssue[],
  ) {
    const summary: ImportResult['summary'] = {
      productsCreated: 0,
      productsUpdated: 0,
      variantsCreated: 0,
      variantsUpdated: 0,
      priceChanges: 0,
      stockChanges: 0,
      brandsCreated: [],
    };
    const hasStock = header.has('stock');

    for (const col of header.keys()) {
      if (col.startsWith('group:') && !ctx.groupByName.has(col.slice(6).toLowerCase())) {
        errors.push({ row: 1, column: col, message: `"${col.slice(6)}" narx guruhi topilmadi` });
      }
    }

    for (const plan of plans) {
      const d = plan.data;
      if (!ctx.categoryBySlug.has(d.categorySlug)) {
        errors.push({ row: plan.row, column: 'category_slug', message: `"${d.categorySlug}" kategoriyasi topilmadi` });
      }
      if (d.brand && !ctx.brandByName.has(d.brand.toLowerCase()) && !summary.brandsCreated.includes(d.brand)) {
        summary.brandsCreated.push(d.brand);
        warnings.push({ row: plan.row, column: 'brand', message: `"${d.brand}" brendi yangi — yaratiladi` });
      }

      const product = ctx.productByCode.get(plan.code);
      if (!product) summary.productsCreated++;
      else if (
        product.code !== plan.code ||
        stableJson(productFields(product)) !== stableJson(this.productInput(plan, ctx))
      ) {
        summary.productsUpdated++;
      }

      for (const v of plan.variants) {
        const existing = ctx.variantBySku.get(v.sku.toUpperCase());
        if (!existing) {
          summary.variantsCreated++;
          if (v.stock && toMilli(v.stock)! > 0) summary.stockChanges++;
          continue;
        }
        if (existing.productId !== ctx.productByCode.get(plan.code)?.id) {
          errors.push({
            row: v.row,
            column: 'sku',
            message: `SKU boshqa mahsulotga tegishli (product_code: ${existing.product.code ?? 'kodsiz'})`,
          });
          continue;
        }
        if (existing.basePrice !== v.basePrice) summary.priceChanges++;
        if (hasStock && v.stock !== null && !existing.stockQty.equals(v.stock)) {
          if (existing.reservedQty.greaterThan(v.stock)) {
            errors.push({
              row: v.row,
              column: 'stock',
              message: `Qoldiq band qilingan miqdordan (${existing.reservedQty.toString()}) kam bo'lolmaydi`,
            });
          }
          summary.stockChanges++;
        }
        if (this.variantChanged(existing, v, ctx)) summary.variantsUpdated++;
      }
    }
    return { summary };
  }

  private productInput(plan: ProductPlan, ctx: Awaited<ReturnType<CatalogImportService['loadContext']>>) {
    const d = plan.data;
    return {
      categoryId: ctx.categoryBySlug.get(d.categorySlug) ?? null,
      brandId: d.brand ? (ctx.brandByName.get(d.brand.toLowerCase()) ?? `new:${d.brand}`) : null,
      nameUz: d.nameUz,
      nameRu: d.nameRu,
      unit: d.unit,
      kind: d.kind,
      minQty: d.minQty,
      qtyStep: d.qtyStep,
      weightKg: d.weightKg,
      volumeM3: d.volumeM3,
      boardLengthMm: d.boardLengthMm,
      boardWidthMm: d.boardWidthMm,
      thicknessMm: d.thicknessMm,
    };
  }

  private variantChanged(
    existing: Prisma.ProductVariantGetPayload<{ include: { priceTiers: true; groupPrices: true } }>,
    v: VariantRow,
    ctx: Awaited<ReturnType<CatalogImportService['loadContext']>>,
  ): boolean {
    if (existing.basePrice !== v.basePrice) return true;
    if (stableJson(existing.attributes) !== stableJson(v.attributes)) return true;
    if (existing.isActive !== v.isActive) return true;
    if (v.lowStock !== null && !existing.lowStockThreshold.equals(v.lowStock)) return true;
    if (v.onOrder !== null && (existing.availability === 'ON_ORDER') !== v.onOrder) return true;
    if (v.leadTimeDays !== existing.leadTimeDays && v.leadTimeDays !== null) return true;
    if (v.tiers) {
      const a = existing.priceTiers.map((t) => `${fromMilli(toMilli(t.minQty.toString())!)}:${t.price}`).sort();
      const b = v.tiers.map((t) => `${t.minQty}:${t.price}`).sort();
      if (a.join() !== b.join()) return true;
    }
    for (const [name, price] of v.groupPrices) {
      const groupId = ctx.groupByName.get(name.toLowerCase());
      const current = existing.groupPrices.find((g) => g.priceGroupId === groupId)?.price ?? null;
      if (current !== price) return true;
    }
    return false;
  }

  // ───────────── Saqlash ─────────────

  private async apply(
    plans: ProductPlan[],
    ctx: Awaited<ReturnType<CatalogImportService['loadContext']>>,
    diff: { summary: ImportResult['summary'] },
    actor: AuthUser,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        for (const name of diff.summary.brandsCreated) {
          const brand = await tx.brand.create({ data: { name } });
          ctx.brandByName.set(name.toLowerCase(), brand.id);
        }

        for (const plan of plans) {
          const input = this.productInput(plan, ctx);
          const data = { ...input, categoryId: input.categoryId!, code: plan.code };
          const existing = ctx.productByCode.get(plan.code);
          const product = existing
            ? await tx.product.update({ where: { id: existing.id }, data })
            : await tx.product.create({ data });

          for (const v of plan.variants) {
            await this.applyVariant(tx, product.id, v, ctx, actor);
          }
        }

        await this.audit.log(
          { actorId: actor.id, entity: 'catalog', entityId: 'import', action: 'excel_import', after: diff.summary },
          tx,
        );
      },
      { timeout: 300_000 },
    );
  }

  private async applyVariant(
    tx: Prisma.TransactionClient,
    productId: string,
    v: VariantRow,
    ctx: Awaited<ReturnType<CatalogImportService['loadContext']>>,
    actor: AuthUser,
  ) {
    const existing = ctx.variantBySku.get(v.sku.toUpperCase());
    const base = {
      attributes: v.attributes,
      basePrice: v.basePrice,
      isActive: v.isActive,
      ...(v.lowStock !== null && { lowStockThreshold: v.lowStock }),
      ...(v.leadTimeDays !== null && { leadTimeDays: v.leadTimeDays }),
      ...(v.onOrder !== null && { availability: v.onOrder ? ('ON_ORDER' as const) : ('IN_STOCK' as const) }),
    };

    let variantId: string;
    if (!existing) {
      const created = await tx.productVariant.create({ data: { ...base, productId, sku: v.sku } });
      variantId = created.id;
      if (v.stock && toMilli(v.stock)! > 0) {
        await tx.productVariant.update({ where: { id: variantId }, data: { stockQty: v.stock } });
        await tx.stockMovement.create({
          data: { variantId, type: 'IN', qty: v.stock, reason: 'Excel import (boshlang\'ich qoldiq)', userId: actor.id },
        });
      }
    } else {
      variantId = existing.id;
      await tx.productVariant.update({ where: { id: variantId }, data: base });
      if (existing.basePrice !== v.basePrice) {
        await tx.priceHistory.create({
          data: { variantId, oldPrice: existing.basePrice, newPrice: v.basePrice, source: 'IMPORT', changedBy: actor.id },
        });
      }
      if (v.stock !== null && !existing.stockQty.equals(v.stock)) {
        const delta = new Prisma.Decimal(v.stock).minus(existing.stockQty);
        // Import va buyurtma bir vaqtda rezervni o'zgartirsa ham CHECK cheklovi himoya qiladi
        await tx.productVariant.update({ where: { id: variantId }, data: { stockQty: { increment: delta } } });
        await tx.stockMovement.create({
          data: { variantId, type: 'ADJUST', qty: delta, reason: 'Excel import (inventarizatsiya)', userId: actor.id },
        });
      }
    }

    if (v.tiers) {
      await tx.variantPriceTier.deleteMany({ where: { variantId } });
      if (v.tiers.length) {
        await tx.variantPriceTier.createMany({ data: v.tiers.map((t) => ({ variantId, minQty: t.minQty, price: t.price })) });
      }
    }
    for (const [name, price] of v.groupPrices) {
      const priceGroupId = ctx.groupByName.get(name.toLowerCase())!;
      if (price === null) {
        await tx.variantGroupPrice.deleteMany({ where: { variantId, priceGroupId } });
      } else {
        await tx.variantGroupPrice.upsert({
          where: { variantId_priceGroupId: { variantId, priceGroupId } },
          create: { variantId, priceGroupId, price },
          update: { price },
        });
      }
    }
  }

  private result(
    committed: boolean,
    rows: number,
    errors: ImportIssue[],
    warnings: ImportIssue[],
    summary?: ImportResult['summary'],
  ): ImportResult {
    return {
      committed,
      rows,
      summary: summary ?? {
        productsCreated: 0,
        productsUpdated: 0,
        variantsCreated: 0,
        variantsUpdated: 0,
        priceChanges: 0,
        stockChanges: 0,
        brandsCreated: [],
      },
      errors: errors.sort((a, b) => a.row - b.row).slice(0, 500),
      warnings: warnings.slice(0, 200),
    };
  }
}

/** Bazadagi mahsulotni import formatidagi ko'rinishga keltiradi (o'zgarish bor-yo'qligini aniqlash uchun) */
function productFields(p: Prisma.ProductGetPayload<object>) {
  return {
    categoryId: p.categoryId,
    brandId: p.brandId,
    nameUz: p.nameUz,
    nameRu: p.nameRu,
    unit: p.unit,
    kind: p.kind,
    minQty: fromMilli(toMilli(p.minQty.toString())!),
    qtyStep: fromMilli(toMilli(p.qtyStep.toString())!),
    weightKg: p.weightKg === null ? null : fromMilli(toMilli(p.weightKg.toString())!),
    volumeM3: p.volumeM3 === null ? null : p.volumeM3.toNumber(),
    boardLengthMm: p.boardLengthMm,
    boardWidthMm: p.boardWidthMm,
    thicknessMm: p.thicknessMm === null ? null : p.thicknessMm.toNumber(),
  };
}
