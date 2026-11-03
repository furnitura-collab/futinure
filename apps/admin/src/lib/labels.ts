import type { DeliveryStatus, DeliveryType, OrderStatus, PaymentMethod, PaymentStatus, PaymentTerms, QuoteLineAction, QuoteStatus, Role, Unit } from '@mebel/shared';

export const STATUS: Record<OrderStatus, { label: string; tone: string }> = {
  NEW: { label: 'Yangi', tone: 'bg-sky-100 text-sky-800 ring-sky-200' },
  QUOTED: { label: 'Taklif yuborildi', tone: 'bg-violet-100 text-violet-800 ring-violet-200' },
  CONFIRMED: { label: 'Kelishildi', tone: 'bg-amber-100 text-amber-800 ring-amber-200' },
  PREPARING: { label: 'Yig\'ilmoqda', tone: 'bg-orange-100 text-orange-800 ring-orange-200' },
  READY: { label: 'Tayyor', tone: 'bg-lime-100 text-lime-800 ring-lime-200' },
  OUT_FOR_DELIVERY: { label: 'Yo\'lda', tone: 'bg-cyan-100 text-cyan-800 ring-cyan-200' },
  DELIVERED: { label: 'Topshirildi', tone: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  COMPLETED: { label: 'Yakunlandi', tone: 'bg-stone-200 text-stone-700 ring-stone-300' },
  CANCELLED: { label: 'Bekor qilindi', tone: 'bg-rose-100 text-rose-800 ring-rose-200' },
};

/** Status o'tishi tugmasi matni (qayerga o'tishiga qarab) */
export const TRANSITION_ACTION: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Tasdiqlash',
  PREPARING: 'Yig\'ishni boshlash',
  READY: 'Tayyor',
  OUT_FOR_DELIVERY: 'Yo\'lga chiqdi',
  DELIVERED: 'Topshirildi',
  CANCELLED: 'Bekor qilish',
};

export const DELIVERY: Record<DeliveryType, string> = { DELIVERY: 'Yetkazish', PICKUP: 'Olib ketish' };

export const DELIVERY_STATUS: Record<DeliveryStatus, { label: string; tone: string }> = {
  ASSIGNED: { label: 'Biriktirilgan', tone: 'bg-sky-100 text-sky-800 ring-sky-200' },
  IN_TRANSIT: { label: 'Yo\'lda', tone: 'bg-cyan-100 text-cyan-800 ring-cyan-200' },
  DELIVERED: { label: 'Topshirildi', tone: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  FAILED: { label: 'Yetkazilmadi', tone: 'bg-rose-100 text-rose-800 ring-rose-200' },
};

export const TERMS: Record<PaymentTerms, string> = {
  PREPAID: 'To\'liq oldindan',
  ADVANCE: 'Avans',
  ON_DELIVERY: 'Topshirishda',
  CREDIT: 'Nasiya',
};

export const METHOD: Record<PaymentMethod, string> = {
  CASH: 'Naqd',
  CARD_TRANSFER: 'Karta o\'tkazma',
  CLICK: 'Click',
  PAYME: 'Payme',
  BANK_TRANSFER: 'Bank o\'tkazma',
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: string }> = {
  PENDING: { label: 'Tekshirilmoqda', tone: 'bg-amber-100 text-amber-800 ring-amber-200' },
  CONFIRMED: { label: 'Tasdiqlangan', tone: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  REJECTED: { label: 'Rad etilgan', tone: 'bg-rose-100 text-rose-800 ring-rose-200' },
};

export const QUOTE_STATUS: Record<QuoteStatus, string> = {
  PENDING: 'Javob kutilmoqda',
  ACCEPTED: 'Qabul qilindi',
  REJECTED: 'Rad etildi',
  SUPERSEDED: 'Yangisi bilan almashdi',
  EXPIRED: 'Muddati o\'tdi',
};

export const QUOTE_ACTION: Record<QuoteLineAction, { label: string; tone: string }> = {
  KEEP: { label: '', tone: '' },
  CHANGE: { label: 'O\'zgardi', tone: 'text-amber-700' },
  REMOVE: { label: 'Olib tashlandi', tone: 'text-rose-700 line-through' },
  REPLACE: { label: 'Analog', tone: 'text-violet-700' },
  ADD: { label: 'Qo\'shildi', tone: 'text-emerald-700' },
};

export const UNIT: Record<Unit, string> = {
  PIECE: 'dona',
  SHEET: 'list',
  METER: 'm',
  SQM: 'm²',
  KG: 'kg',
  SET: 'kompl.',
  PACK: 'pachka',
};

export const ROLE: Record<Role, string> = {
  CUSTOMER: 'Mijoz',
  MANAGER: 'Menejer',
  SUPER_ADMIN: 'Super admin',
  WAREHOUSE: 'Omborchi',
  DRIVER: 'Haydovchi',
};

export const ERROR_TEXT: Record<string, string> = {
  INSUFFICIENT_STOCK: 'Omborda yetarli tovar yo\'q',
  ADVANCE_NOT_PAID: 'Avans hali to\'lanmagan',
  CREDIT_LIMIT_EXCEEDED: 'Kredit limitidan oshadi',
  ORDER_CONFLICT: 'Buyurtmani boshqa xodim o\'zgartirgan — sahifa yangilandi',
  STOCK_NOT_RECEIVED: 'Tovar omborga kirim qilinmagan',
};
