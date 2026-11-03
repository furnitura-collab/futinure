import { useQuery } from '@tanstack/react-query';
import type { DeliveryStatus } from '@mebel/shared';
import { api } from './api';
import type { DriverDelivery } from './types';

export const DELIVERY_TONE: Record<DeliveryStatus, 'info' | 'warning' | 'success' | 'danger'> = {
  ASSIGNED: 'info',
  IN_TRANSIT: 'warning',
  DELIVERED: 'success',
  FAILED: 'danger',
};

export function useDriverDelivery(id: string) {
  return useQuery({ queryKey: ['driver', 'delivery', id], queryFn: () => api<DriverDelivery>(`/driver/deliveries/${id}`) });
}

/** Xaritada ochish: Yandex (O'zbekistonda asosiy) — ilova bo'lsa ilovada ochiladi */
export function mapUrl(a: { lat: number | null; lng: number | null; addressText: string }) {
  return a.lat !== null && a.lng !== null
    ? `https://yandex.uz/maps/?pt=${a.lng},${a.lat}&z=17&l=map`
    : `https://yandex.uz/maps/?text=${encodeURIComponent(a.addressText)}`;
}
