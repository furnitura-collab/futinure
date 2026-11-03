import type { Locale } from '@mebel/shared';

export function som(amount: number | null | undefined, locale: Locale = 'uz') {
  if (amount === null || amount === undefined) return '—';
  const n = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return locale === 'ru' ? `${n} сум` : `${n} so'm`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Toshkent vaqti (UTC+5, yozgi vaqt yo'q) — Intl timeZone hamma qurilmada bo'lmasligi mumkin */
function tashkent(iso: string) {
  return new Date(new Date(iso).getTime() + 5 * 3_600_000);
}

export function date(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = tashkent(iso);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

export function dateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = tashkent(iso);
  return `${date(iso)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function phone(p: string) {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(p);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : p;
}

/** Miqdor maydoni: vergulni nuqtaga, raqam bo'lmagan belgilarni olib tashlaydi */
export function cleanQty(s: string) {
  return s.replace(',', '.').replace(/[^\d.]/g, '');
}
