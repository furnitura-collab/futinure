/** Toshkent kunining boshi (UTC+5, yozgi vaqt yo'q) */
export function dayStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+05:00`);
}

export function nextDayStart(isoDate: string): Date {
  return new Date(dayStart(isoDate).getTime() + 86_400_000);
}

/** `from`..`to` kunlari (ikkalasi ham kiradi) — vaqt maydoni filtri uchun */
export function dayRange(from?: string, to?: string): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;
  return { ...(from && { gte: dayStart(from) }), ...(to && { lt: nextDayStart(to) }) };
}
