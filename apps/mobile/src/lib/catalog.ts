import { attributeLabel, attributeValue, type DeliveryStatus, type Locale, type OrderStatus, type PaymentStatus, type StockLevel } from '@mebel/shared';
import type { Tone } from '@/theme';
import { API_URL } from './config';

export const LEVEL_TONE: Record<StockLevel, Tone> = {
  IN_STOCK: 'success',
  LOW: 'warning',
  ON_ORDER: 'info',
  OUT_OF_STOCK: 'destructive',
};

export const STATUS_TONE: Record<OrderStatus, Tone> = {
  NEW: 'info',
  PREPARING: 'primary',
  READY: 'success',
  OUT_FOR_DELIVERY: 'info',
  DELIVERED: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'destructive',
};

export const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  REJECTED: 'destructive',
};

export const DELIVERY_TONE: Record<DeliveryStatus, Tone> = {
  ASSIGNED: 'info',
  IN_TRANSIT: 'warning',
  DELIVERED: 'success',
  FAILED: 'destructive',
};

/** Katalog rasmlari API serverda: /uploads/catalog/... */
export const imageUri = (url: string | null) => (url ? (url.startsWith('http') ? url : `${API_URL}${url}`) : null);

type Attrs = Record<string, string | number> | null | undefined;

/** { color: "Oq", thickness: 16 } → "Oq · 16 mm" (haydovchi ro'yxati kabi ixcham joylar uchun) */
export const attrsText = (a: Attrs) => (a ? Object.entries(a).map(([k, v]) => attributeValue(k, v)).join(' · ') : '');

/** { color: "Oq", thickness: 16 } → "Rang: Oq · Qalinlik: 16 mm" — nomi bilan, mijoz adashmasin */
export const attrsLabeled = (a: Attrs, locale: Locale) =>
  a ? Object.entries(a).map(([k, v]) => `${attributeLabel(k, locale)}: ${attributeValue(k, v)}`).join(' · ') : '';
