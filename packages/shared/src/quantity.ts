/**
 * Miqdorlar kasr bo'lishi mumkin (12.5 m kromka), shuning uchun float o'rniga
 * "milli" butun sonlar bilan ishlaymiz: 12.5 → 12500. DB'da NUMERIC(12,3).
 */
export const QTY_SCALE = 1000;
const QTY_RE = /^\d{1,9}(\.\d{1,3})?$/;

export type QtyInput = string | number;

/** "12.5" → 12500. Noto'g'ri format, manfiy yoki 3 xonadan ko'p kasr bo'lsa null. */
export function toMilli(qty: QtyInput): number | null {
  const s = typeof qty === 'number' ? numberToPlain(qty) : qty.trim();
  if (s === null || !QTY_RE.test(s)) return null;
  const [int, frac = ''] = s.split('.');
  return Number(int) * QTY_SCALE + Number(frac.padEnd(3, '0'));
}

/** 12500 → "12.5" */
export function fromMilli(milli: number): string {
  const int = Math.trunc(milli / QTY_SCALE);
  const frac = String(milli % QTY_SCALE).padStart(3, '0').replace(/0+$/, '');
  return frac ? `${int}.${frac}` : String(int);
}

function numberToPlain(n: number): string | null {
  if (!Number.isFinite(n) || n < 0) return null;
  // 0.1 + 0.2 kabi float shovqinini kesib tashlaymiz
  return String(Math.round(n * QTY_SCALE) / QTY_SCALE);
}

export type QtyError = 'INVALID' | 'ZERO' | 'BELOW_MIN' | 'NOT_MULTIPLE_OF_STEP';

/**
 * Savat va buyurtma uchun miqdor qoidalari.
 * Qadam min_qty'dan emas, 0'dan hisoblanadi: step=100 bo'lsa 100, 200, 300...
 */
export function validateQty(
  qty: QtyInput,
  rules: { minQty: QtyInput; qtyStep: QtyInput },
): { ok: true; milli: number } | { ok: false; error: QtyError } {
  const milli = toMilli(qty);
  const min = toMilli(rules.minQty);
  const step = toMilli(rules.qtyStep);
  if (milli === null || min === null || step === null) return { ok: false, error: 'INVALID' };
  if (milli === 0) return { ok: false, error: 'ZERO' };
  if (milli < min) return { ok: false, error: 'BELOW_MIN' };
  if (step > 0 && milli % step !== 0) return { ok: false, error: 'NOT_MULTIPLE_OF_STEP' };
  return { ok: true, milli };
}
