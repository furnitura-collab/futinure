import { useQuery } from '@tanstack/react-query';
import type { DeliveryType, OrderStatus } from '@mebel/shared';
import type { I18nKey } from '@/i18n';
import { api } from './api';
import type { OrderListItem, Paginated } from './types';

/** Faol buyurtmalar — tab belgisi va bosh sahifa bitta so'rovdan foydalanadi */
export function useActiveOrders() {
  return useQuery({
    queryKey: ['orders', 'active'],
    queryFn: () => api<Paginated<OrderListItem>>('/orders', { query: { active: true, limit: 50 } }),
  });
}

/** Mijozdan harakat kutayotgan buyurtmalar soni (to'lov, yangi xabar) — tab va sayt sarlavhasidagi belgi */
export function useAttentionCount() {
  const orders = useActiveOrders();
  return orders.data?.items.filter((o) => orderAction(o)).length ?? 0;
}

/** Mijoz hozir nima qilishi kerak — bitta, eng muhimi */
export type OrderAction = 'pay' | 'chat';

export function orderAction(o: { amountDue: number; unreadMessages?: number }): OrderAction | null {
  if (o.amountDue > 0) return 'pay';
  if (o.unreadMessages) return 'chat';
  return null;
}

/** Holat + "keyin nima bo'ladi" jumlasi. To'lov kutilayotgan bo'lsa — shu haqda */
export function statusSentenceKey(status: OrderStatus, deliveryType: DeliveryType, amountDue: number): I18nKey {
  if (amountDue > 0 && status === 'NEW') return 'sayNEW_PAY';
  if (status === 'READY') return deliveryType === 'PICKUP' ? 'sayREADY_PICKUP' : 'sayREADY_DELIVERY';
  return `say${status}` as const;
}

/** 3-bosqich nomi yetkazish turiga bog'liq: "Yo'lda" yoki "Olib ketishga tayyor" */
export const stageKeys = (deliveryType: DeliveryType): I18nKey[] => [
  'stagePlaced',
  'stagePreparing',
  deliveryType === 'PICKUP' ? 'stageReadyPickup' : 'stageOnTheWay',
  'stageHandedOver',
];
