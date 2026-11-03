/** Biznes vaqt zonasi. Server UTC'da ishlasa ham "bugun" Toshkent bo'yicha */
export const BUSINESS_TZ = 'Asia/Tashkent';

/** YYYY-MM-DD, Toshkent vaqti bo'yicha */
export function businessDate(at: Date = new Date()): string {
  // en-CA formati YYYY-MM-DD beradi
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ }).format(at);
}

/** "2026-11-03" + n kun */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isValidIsoDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
