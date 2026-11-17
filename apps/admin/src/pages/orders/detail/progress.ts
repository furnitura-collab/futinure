import type { OrderStatus } from '@mebel/shared';
import type { OrderDetail } from '@/lib/types';

const DELIVERY_FLOW: OrderStatus[] = ['NEW', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'];
const PICKUP_FLOW = DELIVERY_FLOW.filter((s) => s !== 'OUT_FOR_DELIVERY');

/** Buyurtma bosqichlari (olib ketishda "Yo'lda" yo'q) va joriy bosqich o'rni */
export function orderFlow(order: Pick<OrderDetail, 'status' | 'deliveryType'>) {
  const flow = order.deliveryType === 'PICKUP' ? PICKUP_FLOW : DELIVERY_FLOW;
  return { flow, current: flow.indexOf(order.status) };
}

/** Shu bosqichga oxirgi marta qachon o'tilgan (tarixdan) */
export const reachedAt = (order: Pick<OrderDetail, 'statusHistory'>, s: OrderStatus) =>
  order.statusHistory.findLast((h) => h.toStatus === s)?.createdAt;
