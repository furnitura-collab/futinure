import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useToast } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, ApiError } from './api';
import { haptic } from './haptics';
import { useApiMutation } from './mutation';
import type { Cart } from './types';

export function useCart() {
  return useQuery({ queryKey: ['cart'], queryFn: () => api<Cart>('/cart') });
}

/** Savatdagi miqdorni o'rnatish (0 — olib tashlash). Javob — yangi savat */
export function useSetCartItem() {
  return useApiMutation(
    ({ variantId, qty }: { variantId: string; qty: string }) =>
      Number(qty) > 0
        ? api<Cart>(`/cart/items/${variantId}`, { method: 'PUT', body: { qty } })
        : api<Cart>(`/cart/items/${variantId}`, { method: 'DELETE' }),
    { invalidate: [['cart']] },
  );
}

export interface AddToCart {
  variantId: string;
  /** Savatdagi yangi (umumiy) miqdor */
  qty: string;
  /** Toast matni: "LDSP Kronospan — 5 list" */
  label: string;
}

/**
 * Savatga qo'shish — optimistik: belgi va toast darhol, server xato qaytarsa orqaga qaytariladi.
 * Toastda "Savatni ochish" — Amazon/IKEA kabi, foydalanuvchi sahifadan chiqmasdan davom etadi.
 */
export function useAddToCart() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t, errorText } = useI18n();
  return useMutation({
    mutationFn: ({ variantId, qty }: AddToCart) => api<Cart>(`/cart/items/${variantId}`, { method: 'PUT', body: { qty } }),
    onMutate: async ({ variantId, label }) => {
      await qc.cancelQueries({ queryKey: ['cart'] });
      const prev = qc.getQueryData<Cart>(['cart']);
      if (prev && !prev.lines.some((l) => l.variantId === variantId)) qc.setQueryData<Cart>(['cart'], { ...prev, count: prev.count + 1 });
      haptic.success();
      toast(t('addedToCart', { item: label }), 'success', { label: t('openCart'), onPress: () => router.navigate('/cart') });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['cart'], ctx.prev);
      toast(e instanceof ApiError ? errorText(e.code, e.message) : t('error'), 'error');
    },
    onSuccess: (cart) => qc.setQueryData(['cart'], cart),
  });
}

/** Mavjud miqdorga qo'shib hisoblaydi (kasr qadamlarda 0.1+0.2 xatosisiz) */
export const addQty = (current: string | undefined, add: string) => String(Math.round((Number(current ?? 0) + Number(add)) * 1000) / 1000);
