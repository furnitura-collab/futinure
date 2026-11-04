import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api';
import type { Paginated } from './types';

/** Qidiruv maydoni: har harfda so'rov yubormaslik uchun */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Tekshirilishi kerak bo'lgan cheklar soni (menyu nishoni va buyurtmalar kartasi) */
export function usePendingPayments(enabled: boolean) {
  return useQuery({
    queryKey: ['payments', 'pending-count'],
    queryFn: () => api<Paginated<unknown>>('/admin/payments', { query: { status: 'PENDING', limit: 1 } }),
    select: (r) => r.total,
    enabled,
  });
}
