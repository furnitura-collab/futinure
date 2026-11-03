import { toMilli, type QtyInput } from './quantity.js';

/**
 * Mijozga aniq qoldiq ko'rsatilmaydi, faqat daraja (docs/05-questions.md, 5-savol).
 * Sotuvga mavjud = stock − reserved.
 */
export type StockLevel = 'IN_STOCK' | 'LOW' | 'ON_ORDER' | 'OUT_OF_STOCK';

export interface StockInfo {
  stockQty: QtyInput;
  reservedQty: QtyInput;
  lowStockThreshold: QtyInput;
  /** Admin "buyurtma asosida" deb belgilagan (DB'da availability = ON_ORDER) */
  onOrder: boolean;
}

export function availableMilli(s: Pick<StockInfo, 'stockQty' | 'reservedQty'>): number {
  return Math.max(0, (toMilli(s.stockQty) ?? 0) - (toMilli(s.reservedQty) ?? 0));
}

export function stockLevel(s: StockInfo): StockLevel {
  const available = availableMilli(s);
  if (available > 0) {
    return available <= (toMilli(s.lowStockThreshold) ?? 0) ? 'LOW' : 'IN_STOCK';
  }
  return s.onOrder ? 'ON_ORDER' : 'OUT_OF_STOCK';
}

/** Savatga qo'shish mumkinmi (yo'q tovarni faqat ON_ORDER bo'lsa) */
export function isOrderable(level: StockLevel): boolean {
  return level !== 'OUT_OF_STOCK';
}
