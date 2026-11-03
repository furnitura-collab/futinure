import type { OrderStatus, StockLevel } from '@mebel/shared';
import { API_URL } from './config';

export const LEVEL_TONE: Record<StockLevel, 'success' | 'warning' | 'info' | 'danger'> = {
  IN_STOCK: 'success',
  LOW: 'warning',
  ON_ORDER: 'info',
  OUT_OF_STOCK: 'danger',
};

/** Katalog rasmlari API serverda: /uploads/catalog/... */
export const imageUri = (url: string | null) => (url ? (url.startsWith('http') ? url : `${API_URL}${url}`) : null);

/** { color: "Oq", thickness: 16 } → "Oq · 16" */
export const attrsText = (a: Record<string, string | number> | null | undefined) => (a ? Object.values(a).join(' · ') : '');

export const STATUS_TONE: Record<OrderStatus, 'info' | 'violet' | 'warning' | 'brand' | 'success' | 'muted' | 'danger'> = {
  NEW: 'info',
  QUOTED: 'violet',
  CONFIRMED: 'warning',
  PREPARING: 'brand',
  READY: 'success',
  OUT_FOR_DELIVERY: 'info',
  DELIVERED: 'success',
  COMPLETED: 'muted',
  CANCELLED: 'danger',
};
