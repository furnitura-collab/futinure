import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import type { OrderStatus } from '@mebel/shared';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import type { OrderCard, OrderDetail } from '@/lib/types';

export type PendingTransition = { order: OrderDetail; to: OrderStatus; requiresComment: boolean };

/**
 * Kartani ustunga tashlash: buyurtmaning yangi holati olinadi (versiya, shartlar) va server ruxsat bergan
 * o'tish bo'lsagina TransitionDialog ochiladi — mahalliy qoidalar faqat yoritish uchun.
 */
export function useBoardDrop() {
  const { t, label, errorText } = useI18n();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingTransition | null>(null);

  const drop = async (card: OrderCard, to: OrderStatus) => {
    setBusyId(card.id);
    try {
      const order = await qc.fetchQuery({
        queryKey: ['order', card.id],
        queryFn: () => api<OrderDetail>(`/admin/orders/${card.id}`),
        staleTime: 0,
      });
      const tr = order.availableTransitions.find((x) => x.to === to);
      if (tr) setPending({ order, to, requiresComment: tr.requiresComment });
      else toast.error(t('orders.drag.notAllowed', { number: card.number, status: label('orderStatus', to) }));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  return { busyId, pending, drop, close: () => setPending(null) };
}
