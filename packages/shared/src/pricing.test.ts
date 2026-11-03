import { describe, expect, it } from 'vitest';
import { applyPercent, computeOrderTotals, lineTotal, resolveUnitPrice } from './pricing.js';
import { fromMilli, toMilli, validateQty } from './quantity.js';
import { normalizeUzPhone } from './phone.js';

describe('quantity', () => {
  it('toMilli / fromMilli', () => {
    expect(toMilli('12.5')).toBe(12500);
    expect(toMilli(12.5)).toBe(12500);
    expect(toMilli(0.1 + 0.2)).toBe(300);
    expect(toMilli('3')).toBe(3000);
    expect(toMilli('1.2345')).toBeNull();
    expect(toMilli('-1')).toBeNull();
    expect(toMilli('abc')).toBeNull();
    expect(fromMilli(12500)).toBe('12.5');
    expect(fromMilli(3000)).toBe('3');
    expect(fromMilli(1005)).toBe('1.005');
  });

  it('validateQty: minimal va qadam', () => {
    const pack = { minQty: 100, qtyStep: 100 };
    expect(validateQty(100, pack).ok).toBe(true);
    expect(validateQty(300, pack).ok).toBe(true);
    expect(validateQty(150, pack)).toEqual({ ok: false, error: 'NOT_MULTIPLE_OF_STEP' });
    expect(validateQty(0, pack)).toEqual({ ok: false, error: 'ZERO' });

    const edge = { minQty: '1', qtyStep: '0.5' };
    expect(validateQty('12.5', edge).ok).toBe(true);
    expect(validateQty('12.3', edge)).toEqual({ ok: false, error: 'NOT_MULTIPLE_OF_STEP' });
    expect(validateQty('0.5', edge)).toEqual({ ok: false, error: 'BELOW_MIN' });
  });
});

describe('pricing', () => {
  const source = {
    basePrice: 300_000,
    tiers: [
      { minQty: 10, price: 290_000 },
      { minQty: 50, price: 280_000 },
    ],
  };

  it('pog\'onali narx miqdorga qarab', () => {
    expect(resolveUnitPrice(source, 5)).toEqual({ unitPrice: 300_000, reason: 'BASE' });
    expect(resolveUnitPrice(source, 10)).toEqual({ unitPrice: 290_000, reason: 'TIER' });
    expect(resolveUnitPrice(source, 60)).toEqual({ unitPrice: 280_000, reason: 'TIER' });
  });

  it('guruh narxi arzonroq bo\'lsa u olinadi, qimmatroq bo\'lsa yo\'q', () => {
    expect(resolveUnitPrice({ ...source, groupPrice: 285_000 }, 10)).toEqual({ unitPrice: 285_000, reason: 'GROUP' });
    expect(resolveUnitPrice({ ...source, groupPrice: 285_000 }, 60)).toEqual({ unitPrice: 280_000, reason: 'TIER' });
    expect(resolveUnitPrice({ basePrice: 1000, groupPrice: null }, 1).reason).toBe('BASE');
  });

  it('lineTotal kasr miqdor bilan yaxlitlaydi', () => {
    expect(lineTotal('12.5', 4_500)).toBe(56_250);
    expect(lineTotal('0.333', 1_000)).toBe(333);
    expect(lineTotal('1.5', 3)).toBe(5); // 4.5 → 5
    expect(lineTotal('999999', 9_000_000_000)).toBe(8_999_991_000_000_000);
  });

  it('computeOrderTotals', () => {
    const t = computeOrderTotals({
      lines: [
        { qty: 3, unitPrice: 300_000 },
        { qty: '12.5', unitPrice: 4_500 },
      ],
      servicesTotal: 50_000,
      deliveryFee: 80_000,
      discountTotal: 6_250,
    });
    expect(t).toEqual({
      itemsTotal: 956_250,
      servicesTotal: 50_000,
      deliveryFee: 80_000,
      discountTotal: 6_250,
      grandTotal: 1_080_000,
    });
  });

  it('applyPercent', () => {
    expect(applyPercent(285_000, 5, 1000)).toBe(299_000);
    expect(applyPercent(100_000, -10)).toBe(90_000);
  });
});

describe('phone', () => {
  it.each([
    ['+998 90 123 45 67', '+998901234567'],
    ['998901234567', '+998901234567'],
    ['90 123-45-67', '+998901234567'],
    ['(33) 1234567', '+998331234567'],
  ])('%s', (input, out) => expect(normalizeUzPhone(input)).toBe(out));

  it.each(['12345', '+7 900 123 45 67', '012345678'])('rad etiladi: %s', (input) =>
    expect(normalizeUzPhone(input)).toBeNull(),
  );
});
