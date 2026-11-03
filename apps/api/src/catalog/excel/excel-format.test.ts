import { describe, expect, it } from 'vitest';
import { attrValue, parseBool, parseMoney, parseQty, stableJson } from './excel-format.js';

describe('excel-format', () => {
  it('parseMoney: probel va vergulli minglar', () => {
    expect(parseMoney('395 000')).toEqual({ ok: true, value: 395_000n });
    expect(parseMoney('395,000')).toEqual({ ok: true, value: 395_000n });
    expect(parseMoney('395000.5').ok).toBe(false);
    expect(parseMoney('-1').ok).toBe(false);
  });

  it('parseQty: vergulli kasr', () => {
    expect(parseQty('12,5')).toEqual({ ok: true, value: '12.5' });
    expect(parseQty('1.0001').ok).toBe(false);
  });

  it('parseBool: uz/ru/en', () => {
    for (const v of ['ha', 'Ha', 'да', 'yes', '1']) expect(parseBool(v)).toEqual({ ok: true, value: true });
    for (const v of ["yo'q", 'нет', 'no', '0']) expect(parseBool(v)).toEqual({ ok: true, value: false });
    expect(parseBool('balki').ok).toBe(false);
  });

  it('attrValue: boshida nol bo\'lgan kod matn bo\'lib qoladi', () => {
    expect(attrValue('0190')).toBe('0190');
    expect(attrValue('16')).toBe(16);
    expect(attrValue('0.4')).toBe(0.4);
    expect(attrValue('2,5')).toBe(2.5);
    expect(attrValue('W980')).toBe('W980');
  });

  it('stableJson kalit tartibiga qaramaydi', () => {
    expect(stableJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(stableJson({ a: [{ c: 3, d: 2 }], b: 1 }));
  });
});
