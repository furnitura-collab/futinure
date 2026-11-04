import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Notification, Paginated } from './types';

/** O'qilmagan bildirishnomalar soni — bosh sahifa, profil va sayt sarlavhasi bitta so'rovdan */
export function useUnreadCount() {
  const q = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api<Paginated<Notification> & { unread: number }>('/notifications', { query: { limit: 1 } }),
  });
  return q.data?.unread ?? 0;
}
