import { describe, expect, it } from 'vitest';
import { isOrderable, stockLevel } from './availability.js';

const s = (stockQty: string, reservedQty = '0', lowStockThreshold = '10', onOrder = false) => ({
  stockQty,
  reservedQty,
  lowStockThreshold,
  onOrder,
});

describe('stockLevel', () => {
  it.each([
    [s('120'), 'IN_STOCK'],
    [s('10'), 'LOW'],
    [s('120', '115'), 'LOW'],
    [s('5', '5'), 'OUT_OF_STOCK'],
    [s('0', '0', '0', true), 'ON_ORDER'],
    [s('3', '0', '10', true), 'LOW'],
    [s('0.5', '0', '0'), 'IN_STOCK'],
  ] as const)('%o → %s', (input, level) => expect(stockLevel(input)).toBe(level));

  it('isOrderable', () => {
    expect(isOrderable('OUT_OF_STOCK')).toBe(false);
    expect(isOrderable('ON_ORDER')).toBe(true);
  });
});
