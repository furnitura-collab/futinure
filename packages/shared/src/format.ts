import type { Locale } from './enums.js';

const CURRENCY: Record<Locale, string> = { uz: "so'm", ru: 'сум', en: 'UZS' };
const TASHKENT_OFFSET_MS = 5 * 3_600_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** 4620000 → "4 620 000" */
export function formatNumber(amount: number | bigint): string {
  return Number(amount)
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** 4620000 → "4 620 000 so'm" / "4 620 000 сум" / "4 620 000 UZS" */
export function formatMoney(amount: number | bigint | null | undefined, locale: Locale = 'uz'): string {
  if (amount === null || amount === undefined) return '—';
  return `${formatNumber(amount)} ${CURRENCY[locale]}`;
}

/**
 * Toshkent vaqti qo'lda hisoblanadi (UTC+5, yozgi vaqt yo'q):
 * Hermes'da Intl timeZone har doim ham mavjud emas.
 */
function tashkentParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + TASHKENT_OFFSET_MS);
  return { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

/** "03.11.2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = tashkentParts(iso);
  return `${pad(p.day)}.${pad(p.month)}.${p.year}`;
}

/** "03.11.2026 14:05" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = tashkentParts(iso);
  return `${formatDate(iso)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** +998901234567 → "+998 90 123 45 67" */
export function formatPhone(phone: string): string {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}
