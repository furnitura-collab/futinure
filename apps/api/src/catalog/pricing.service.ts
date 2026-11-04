import { Injectable } from '@nestjs/common';
import {
  availableMilli,
  fromMilli,
  isOrderable,
  lineTotal,
  resolveUnitPrice,
  stockLevel,
  validateQty,
  type PriceReason,
  type QtyError,
  type StockLevel,
} from '@mebel/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Narx hisoblash uchun variantni qanday yuklash kerak */
export function variantPricingInclude(priceGroupId: string | null) {
  return {
    priceTiers: { orderBy: { minQty: 'asc' } },
    // Guruhsiz mijozda guruh narxi umuman yuklanmaydi
    groupPrices: { where: { priceGroupId: { in: priceGroupId ? [priceGroupId] : [] } } },
  } satisfies Prisma.ProductVariantInclude;
}

type PricedVariant = Prisma.ProductVariantGetPayload<{ include: ReturnType<typeof variantPricingInclude> }>;

export function variantStockLevel(v: {
  stockQty: Prisma.Decimal;
  reservedQty: Prisma.Decimal;
  lowStockThreshold: Prisma.Decimal;
  availability: string;
}): StockLevel {
  return stockLevel({
    stockQty: v.stockQty.toString(),
    reservedQty: v.reservedQty.toString(),
    lowStockThreshold: v.lowStockThreshold.toString(),
    onOrder: v.availability === 'ON_ORDER',
  });
}

export function priceOf(v: PricedVariant, qty: string) {
  return resolveUnitPrice(
    {
      basePrice: Number(v.basePrice),
      tiers: v.priceTiers.map((t) => ({ minQty: t.minQty.toString(), price: Number(t.price) })),
      groupPrice: v.groupPrices[0] ? Number(v.groupPrices[0].price) : null,
    },
    qty,
  );
}

export type LineIssue =
  | { code: 'NOT_FOUND' | 'INACTIVE' | 'OUT_OF_STOCK' }
  | { code: QtyError; minQty: string; qtyStep: string }
  | { code: 'EXCEEDS_AVAILABLE'; available: string };

export interface PricedLine {
  variantId: string;
  qty: string;
  sku: string | null;
  productId: string | null;
  nameUz: string | null;
  nameRu: string | null;
  unit: string | null;
  /** Savatdagi kichik rasm (yoki kategoriya rangidagi belgi) uchun */
  categoryId: string | null;
  kind: string | null;
  imageUrl: string | null;
  /** Miqdor qoidalari — ilova +/- tugmalari uchun */
  minQty: string | null;
  qtyStep: string | null;
  attributes: unknown;
  unitPrice: number;
  basePrice: number;
  priceReason: PriceReason | null;
  lineTotal: number;
  stockLevel: StockLevel | null;
  leadTimeDays: number | null;
  weightKg: number;
  volumeM3: number;
  issues: LineIssue[];
}

/**
 * Narx va mavjudlikni hisoblashning yagona joyi.
 * Katalog, savat va buyurtma yaratish shu servisni ishlatadi.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Mijozning narx guruhi. Mehmon va xodim uchun null — chakana narx */
  async priceGroupOf(userId: string | null | undefined, db: Prisma.TransactionClient = this.prisma): Promise<string | null> {
    if (!userId) return null;
    const profile = await db.customerProfile.findUnique({
      where: { userId },
      select: { priceGroupId: true },
    });
    return profile?.priceGroupId ?? null;
  }

  async priceLines(
    userId: string | null,
    items: readonly { variantId: string; qty: string }[],
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<{ lines: PricedLine[]; itemsTotal: number; hasIssues: boolean; totalWeightKg: number; totalVolumeM3: number }> {
    const groupId = await this.priceGroupOf(userId, db);
    const variants = await db.productVariant.findMany({
      where: { id: { in: items.map((i) => i.variantId) } },
      include: {
        ...variantPricingInclude(groupId),
        product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } } } },
      },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    const lines = items.map((item): PricedLine => {
      const v = byId.get(item.variantId);
      if (!v) {
        return {
          ...emptyLine(item),
          issues: [{ code: 'NOT_FOUND' }],
        };
      }
      const issues: LineIssue[] = [];
      const p = v.product;
      if (!v.isActive || !p.isActive) issues.push({ code: 'INACTIVE' });

      const rules = { minQty: p.minQty.toString(), qtyStep: p.qtyStep.toString() };
      const qtyCheck = validateQty(item.qty, rules);
      if (!qtyCheck.ok) issues.push({ code: qtyCheck.error, ...rules });

      const level = variantStockLevel(v);
      if (!isOrderable(level)) {
        issues.push({ code: 'OUT_OF_STOCK' });
      } else if (qtyCheck.ok && v.availability !== 'ON_ORDER') {
        // "Buyurtma asosida" tovar qoldiqdan ko'p ham buyurtma qilinadi
        const available = availableMilli({ stockQty: v.stockQty.toString(), reservedQty: v.reservedQty.toString() });
        if (qtyCheck.milli > available) {
          issues.push({ code: 'EXCEEDS_AVAILABLE', available: fromMilli(available) });
        }
      }

      const price = priceOf(v, item.qty);
      const qtyNum = Number(item.qty);
      return {
        variantId: v.id,
        qty: item.qty,
        sku: v.sku,
        productId: p.id,
        nameUz: p.nameUz,
        nameRu: p.nameRu,
        unit: p.unit,
        categoryId: p.categoryId,
        kind: p.kind,
        imageUrl: p.images[0]?.url ?? null,
        minQty: p.minQty.toString(),
        qtyStep: p.qtyStep.toString(),
        attributes: v.attributes,
        unitPrice: price.unitPrice,
        basePrice: Number(v.basePrice),
        priceReason: price.reason,
        lineTotal: lineTotal(item.qty, price.unitPrice),
        stockLevel: level,
        leadTimeDays: v.leadTimeDays,
        weightKg: round3(Number(p.weightKg ?? 0) * qtyNum),
        volumeM3: round3(Number(p.volumeM3 ?? 0) * qtyNum),
        issues,
      };
    });

    return {
      lines,
      itemsTotal: lines.reduce((s, l) => s + l.lineTotal, 0),
      hasIssues: lines.some((l) => l.issues.length > 0),
      totalWeightKg: round3(lines.reduce((s, l) => s + l.weightKg, 0)),
      totalVolumeM3: round3(lines.reduce((s, l) => s + l.volumeM3, 0)),
    };
  }
}

function emptyLine(item: { variantId: string; qty: string }): Omit<PricedLine, 'issues'> {
  return {
    variantId: item.variantId,
    qty: item.qty,
    sku: null,
    productId: null,
    nameUz: null,
    nameRu: null,
    unit: null,
    categoryId: null,
    kind: null,
    imageUrl: null,
    minQty: null,
    qtyStep: null,
    attributes: null,
    unitPrice: 0,
    basePrice: 0,
    priceReason: null,
    lineTotal: 0,
    stockLevel: null,
    leadTimeDays: null,
    weightKg: 0,
    volumeM3: 0,
  };
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
