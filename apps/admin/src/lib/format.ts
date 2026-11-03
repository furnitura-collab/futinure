import { BUSINESS_TZ } from '@mebel/shared';

/** 4620000 → "4 620 000 so'm" */
export function som(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return '—';
  return `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;
}

/** 4620000 → "4 620 000" (jadvallar uchun) */
export function num(amount: number) {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', { timeZone: BUSINESS_TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('ru-RU', { timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit' });

/** "03.11.2026" */
export function date(iso: string | null | undefined) {
  return iso ? dateFmt.format(new Date(iso)) : '—';
}

/** "03.11.2026 14:05" */
export function dateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${dateFmt.format(d)} ${timeFmt.format(d)}`;
}

/** "5 daq", "3 soat", "2 kun" — qancha vaqt o'tdi */
export function ago(iso: string, now = Date.now()) {
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'hozir';
  if (min < 60) return `${min} daq`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} soat`;
  return `${Math.floor(h / 24)} kun`;
}

/** Telefon: +998901234567 → "+998 90 123 45 67" */
export function phone(p: string) {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(p);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : p;
}
