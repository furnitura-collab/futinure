import { availableTransitions, findTransition, ORDER_STATUSES, type OrderStatus, type Role } from '@mebel/shared';
import type { OrderCard } from '@/lib/types';

/** Mahalliy tekshiruv (rol + yetkazish turi) — faqat ustunlarni yoritish uchun; yakuniy so'z serverda */
export function canMove(card: OrderCard, to: OrderStatus, role: Role | undefined): boolean {
  if (!role || card.status === to) return false;
  const tr = findTransition(card.status, to);
  return !!tr && tr.roles.includes(role) && (!tr.deliveryType || tr.deliveryType === card.deliveryType);
}

export const isMovable = (card: OrderCard, role: Role | undefined) => !!role && availableTransitions(card.status, role, card.deliveryType).length > 0;

export const isOrderStatus = (v: unknown): v is OrderStatus => (ORDER_STATUSES as readonly unknown[]).includes(v);
