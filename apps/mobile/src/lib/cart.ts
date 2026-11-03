import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useI18n } from './i18n';
import { useApiMutation } from './mutation';
import type { Cart } from './types';

export function useCart() {
  return useQuery({ queryKey: ['cart'], queryFn: () => api<Cart>('/cart') });
}

/** Savatdagi miqdorni o'rnatish (0 — olib tashlash). Javob — yangi savat */
export function useSetCartItem() {
  const { t } = useI18n();
  const mutation = useApiMutation(
    ({ variantId, qty }: { variantId: string; qty: string; toast?: boolean }) =>
      Number(qty) > 0
        ? api<Cart>(`/cart/items/${variantId}`, { method: 'PUT', body: { qty } })
        : api<Cart>(`/cart/items/${variantId}`, { method: 'DELETE' }),
    { invalidate: [['cart']] },
  );
  return { ...mutation, addedText: t('inCart') };
}
