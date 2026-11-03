import { describe, expect, it } from 'vitest';
import { addDays, businessDate, isValidIsoDate } from './dates.js';

describe('dates', () => {
  it('Toshkent bo\'yicha sana: UTC 20:00 — Toshkentda ertasi kun', () => {
    expect(businessDate(new Date('2026-11-03T20:00:00Z'))).toBe('2026-11-04');
    expect(businessDate(new Date('2026-11-03T18:59:00Z'))).toBe('2026-11-03');
  });

  it('addDays oy va yil chegarasidan o\'tadi', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('isValidIsoDate', () => {
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
  });
});
