import { businessDate } from './dates.js';
import type { Locale, OrderStatus, PaymentTerms } from './enums.js';

/**
 * Mijozga ko'rinadigan 5 bosqich. Ichki statuslar (9 ta) mijoz uchun ortiqcha —
 * Uber Eats / Amazon kabi qisqa va tushunarli kuzatuv.
 */
export const CUSTOMER_STAGES = ['PLACED', 'AGREED', 'PREPARING', 'ON_THE_WAY', 'HANDED_OVER'] as const;
export type CustomerStage = (typeof CUSTOMER_STAGES)[number];

const STAGE_OF: Record<OrderStatus, number> = {
  NEW: 0,
  QUOTED: 0,
  CONFIRMED: 1,
  PREPARING: 2,
  READY: 3,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
  COMPLETED: 4,
  CANCELLED: -1,
};

/** Joriy bosqich indeksi (0–4); bekor qilingan buyurtma — -1 */
export function customerStage(status: OrderStatus): number {
  return STAGE_OF[status];
}

export interface AmountDueInput {
  status: OrderStatus;
  paymentTerms: PaymentTerms | null;
  grandTotal: number;
  paidTotal: number;
  advanceAmount: number;
  /** Nasiya muddati (YYYY-MM-DD yoki ISO) */
  dueDate: string | Date | null;
  /** Tekshirilayotgan cheklar — mijoz allaqachon to'lagan, qayta so'ramaymiz */
  pendingTotal?: number;
  /** Bugungi sana (test uchun), standart — Toshkent bo'yicha bugun */
  today?: string;
}

const AFTER_HANDOVER: readonly OrderStatus[] = ['DELIVERED', 'COMPLETED'];
const AT_HANDOVER: readonly OrderStatus[] = ['READY', 'OUT_FOR_DELIVERY', ...AFTER_HANDOVER];

/**
 * Mijoz HOZIR to'lashi kerak bo'lgan summa (0 — hozircha to'lov kutilmaydi).
 * Qoidalar API'dagi PREPARING oldi tekshiruvi bilan bir xil: PREPAID — hammasi, ADVANCE — avans,
 * topshirishda — tayyor bo'lganda, nasiya — muddati kelganda.
 */
export function amountDueNow(o: AmountDueInput): number {
  if (!o.paymentTerms || o.status === 'CANCELLED' || customerStage(o.status) < 1) return 0;
  const balance = o.grandTotal - o.paidTotal;
  let required: number;
  switch (o.paymentTerms) {
    case 'PREPAID':
      required = balance;
      break;
    case 'ADVANCE':
      required = AT_HANDOVER.includes(o.status) ? balance : o.advanceAmount - o.paidTotal;
      break;
    case 'ON_DELIVERY':
      required = AT_HANDOVER.includes(o.status) ? balance : 0;
      break;
    case 'CREDIT': {
      const due = o.dueDate ? (typeof o.dueDate === 'string' ? o.dueDate : o.dueDate.toISOString()).slice(0, 10) : null;
      required = due && due <= (o.today ?? businessDate()) ? balance : 0;
      break;
    }
  }
  return Math.max(0, Math.min(balance, required) - (o.pendingTotal ?? 0));
}

/** Variant atributlari kalitlari ("thickness") → sarlavha ("Qalinlik") */
const ATTRIBUTE_LABELS: Record<Locale, Record<string, string>> = {
  uz: { color: 'Rang', thickness: 'Qalinlik', decor_code: 'Dekor kodi', length: 'Uzunlik', width: 'Kenglik', angle: 'Burchak', pack: "O'ram", size: "O'lcham" },
  ru: { color: 'Цвет', thickness: 'Толщина', decor_code: 'Код декора', length: 'Длина', width: 'Ширина', angle: 'Угол', pack: 'Упаковка', size: 'Размер' },
  en: { color: 'Colour', thickness: 'Thickness', decor_code: 'Decor code', length: 'Length', width: 'Width', angle: 'Angle', pack: 'Pack', size: 'Size' },
};

/** Noma'lum kalit ham o'qiladigan bo'lsin: "edge_type" → "Edge type" */
export function attributeLabel(key: string, locale: Locale): string {
  const known = ATTRIBUTE_LABELS[locale][key];
  if (known) return known;
  const words = key.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** O'lchov birligi bor atributlar: 16 → "16 mm" */
const ATTRIBUTE_SUFFIX: Record<string, string> = { thickness: 'mm', length: 'mm', width: 'mm', angle: '°' };

export function attributeValue(key: string, value: string | number): string {
  const suffix = ATTRIBUTE_SUFFIX[key];
  if (!suffix || typeof value !== 'number') return String(value);
  return suffix === '°' ? `${value}°` : `${value} ${suffix}`;
}
