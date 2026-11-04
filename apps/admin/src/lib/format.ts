import type { I18n } from '@/i18n';

/** "5 daq", "3 soat", "2 kun" — qancha vaqt o'tdi */
export function ago(iso: string, t: I18n['t'], now = Date.now()) {
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return t('time.now');
  if (min < 60) return t('time.minutes', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('time.hours', { n: h });
  return t('time.days', { n: Math.floor(h / 24) });
}

/** Mijozning ko'rinadigan nomi: firma → ism → telefon */
export function customerName(c: { fullName: string | null; phone: string; customerProfile?: { companyName: string | null } | null }) {
  return c.customerProfile?.companyName || c.fullName || c.phone;
}
