import { QTY_SCALE, toMilli, type QtyInput } from './quantity.js';

/** Pul — butun so'm. Number.MAX_SAFE_INTEGER (~9e15) bizga yetarli. */
export type Money = number;

export interface PriceTier {
  minQty: QtyInput;
  price: Money;
}

export interface PriceSource {
  basePrice: Money;
  tiers?: readonly PriceTier[];
  /** Mijoz guruhining shu variant uchun narxi (bo'lsa) */
  groupPrice?: Money | null;
}

export type PriceReason = 'BASE' | 'TIER' | 'GROUP';

/**
 * Birlik narxini tanlash: asosiy narx, miqdorga mos pog'ona va guruh narxi
 * ichidan eng arzoni. docs/01-er-diagram.md → "Narx tanlash qoidasi".
 */
export function resolveUnitPrice(
  source: PriceSource,
  qty: QtyInput,
): { unitPrice: Money; reason: PriceReason } {
  const qtyMilli = toMilli(qty) ?? 0;
  let best: { unitPrice: Money; reason: PriceReason } = { unitPrice: source.basePrice, reason: 'BASE' };

  for (const tier of source.tiers ?? []) {
    const min = toMilli(tier.minQty);
    if (min !== null && qtyMilli >= min && tier.price < best.unitPrice) {
      best = { unitPrice: tier.price, reason: 'TIER' };
    }
  }
  if (source.groupPrice != null && source.groupPrice < best.unitPrice) {
    best = { unitPrice: source.groupPrice, reason: 'GROUP' };
  }
  return best;
}

/** qty × narx, so'mga yaxlitlab (0.5 yuqoriga). BigInt — katta ko'paytmada aniqlik yo'qolmasin. */
export function lineTotal(qty: QtyInput, unitPrice: Money): Money {
  const milli = toMilli(qty);
  if (milli === null) throw new Error(`Invalid qty: ${qty}`);
  const scaled = BigInt(milli) * BigInt(unitPrice);
  const scale = BigInt(QTY_SCALE);
  const rounded = (scaled + scale / 2n) / scale;
  return Number(rounded);
}

export interface OrderTotalsInput {
  lines: readonly { qty: QtyInput; unitPrice: Money }[];
  servicesTotal?: Money;
  deliveryFee?: Money;
  discountTotal?: Money;
}

export interface OrderTotals {
  itemsTotal: Money;
  servicesTotal: Money;
  deliveryFee: Money;
  discountTotal: Money;
  grandTotal: Money;
}

export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  const itemsTotal = input.lines.reduce((sum, l) => sum + lineTotal(l.qty, l.unitPrice), 0);
  const servicesTotal = input.servicesTotal ?? 0;
  const deliveryFee = input.deliveryFee ?? 0;
  const discountTotal = input.discountTotal ?? 0;
  const grandTotal = Math.max(0, itemsTotal + servicesTotal + deliveryFee - discountTotal);
  return { itemsTotal, servicesTotal, deliveryFee, discountTotal, grandTotal };
}

/** Ommaviy narx o'zgartirish: foiz va yaxlitlash (masalan 1000 so'mga). */
export function applyPercent(price: Money, percent: number, roundTo: Money = 1): Money {
  const raw = (price * (100 + percent)) / 100;
  return Math.max(0, Math.round(raw / roundTo) * roundTo);
}
