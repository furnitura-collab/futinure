import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { DriverDelivery, DriverList } from './types';

export function useDriverDelivery(id: string) {
  return useQuery({ queryKey: ['driver', 'delivery', id], queryFn: () => api<DriverDelivery>(`/driver/deliveries/${id}`) });
}

/** Xaritada ochish: Yandex (O'zbekistonda asosiy) — ilova bo'lsa ilovada ochiladi */
export function mapUrl(a: { lat: number | null; lng: number | null; addressText: string }) {
  return a.lat !== null && a.lng !== null
    ? `https://yandex.uz/maps/?pt=${a.lng},${a.lat}&z=17&l=map`
    : `https://yandex.uz/maps/?text=${encodeURIComponent(a.addressText)}`;
}

export const plannedDay = (d: DriverDelivery) => d.scheduledDate?.slice(0, 10) ?? null;

/** Yo'ldagi — birinchi, keyin kechikkan, keyin reja sanasi bo'yicha */
const rank = (d: DriverDelivery, today: string) => (d.order.status === 'OUT_FOR_DELIVERY' ? 0 : (plannedDay(d) ?? today) < today ? 1 : 2);

export interface DriverSection {
  key: 'today' | 'upcoming' | 'done';
  data: DriverDelivery[];
}

/** Bugungi (va kechikkan, sanasiz) yetkazishlar birinchi, keyingi kunlar alohida, oxirida — bugun topshirilganlar */
export function driverSections(list: DriverList): DriverSection[] {
  const { today } = list;
  const sorted = [...list.active].sort((a, b) => rank(a, today) - rank(b, today) || (plannedDay(a) ?? today).localeCompare(plannedDay(b) ?? today));
  const isLater = (d: DriverDelivery) => (plannedDay(d) ?? today) > today && d.order.status !== 'OUT_FOR_DELIVERY';
  const sections: DriverSection[] = [
    { key: 'today', data: sorted.filter((d) => !isLater(d)) },
    { key: 'upcoming', data: sorted.filter(isLater) },
    { key: 'done', data: list.done },
  ];
  return sections.filter((s) => s.key === 'today' || s.data.length);
}
