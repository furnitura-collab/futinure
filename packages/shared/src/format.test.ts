import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatMoney, formatPhone } from './format.js';
import { apiErrorText, label } from './labels.js';

describe('format', () => {
  it('pul tilga qarab', () => {
    expect(formatMoney(4620000)).toBe("4 620 000 so'm");
    expect(formatMoney(4620000n, 'ru')).toBe('4 620 000 сум');
    expect(formatMoney(1500, 'en')).toBe('1 500 UZS');
    expect(formatMoney(null)).toBe('—');
  });

  it('sana Toshkent vaqtida', () => {
    expect(formatDate('2026-11-03T20:30:00Z')).toBe('04.11.2026');
    expect(formatDateTime('2026-11-03T09:05:00Z')).toBe('03.11.2026 14:05');
  });

  it('telefon', () => {
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67');
    expect(formatPhone('123')).toBe('123');
  });

  it('enum yorliqlari va xato matnlari', () => {
    expect(label('orderStatus', 'READY', 'en')).toBe('Ready');
    expect(label('unit', 'SHEET', 'ru')).toBe('лист');
    expect(apiErrorText('CART_EMPTY', 'en', 'x')).toBe('Your cart is empty');
    expect(apiErrorText('UNKNOWN', 'uz', 'server matni')).toBe('server matni');
  });
});
