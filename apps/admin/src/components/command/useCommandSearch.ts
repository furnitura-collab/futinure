import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { formatPhone } from '@mebel/shared';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { customerName } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import type { AdminProduct, CustomerRow, OrderCard, Paginated } from '@/lib/types';
import { MANAGERS } from '../nav';

export interface SearchHit {
  id: string;
  to: string;
  title: string;
  meta?: string;
}

export interface SearchGroups {
  orders: SearchHit[];
  customers: SearchHit[];
  products: SearchHit[];
}

const LIMIT = 5;
const EMPTY: SearchGroups = { orders: [], customers: [], products: [] };

const list = <T>(path: string, q: string) =>
  api<Paginated<T>>(path, { query: { q, page: 1, limit: LIMIT } }).then((r) => r.items);

/** Uch bo'limda parallel qidiruv; omborchiga faqat buyurtmalar (qolganiga ruxsati yo'q) */
export function useCommandSearch(input: string) {
  const { money } = useI18n();
  const { can } = useAuth();
  const manager = can(...MANAGERS);
  const q = useDebounced(input.trim(), 250);
  const enabled = q.length >= 2;

  const query = useQuery({
    queryKey: ['palette', q, manager],
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<SearchGroups> => {
      const [orders, customers, products] = await Promise.all([
        list<OrderCard>('/admin/orders', q),
        manager ? list<CustomerRow>('/admin/customers', q) : [],
        manager ? list<AdminProduct>('/admin/products', q) : [],
      ]);
      return {
        orders: orders.map((o) => ({ id: o.id, to: `/orders/${o.id}`, title: o.number, meta: `${customerName(o.customer)} · ${money(o.grandTotal)}` })),
        customers: customers.map((c) => ({ id: c.id, to: `/customers/${c.id}`, title: customerName(c), meta: formatPhone(c.phone) })),
        products: products.map((p) => ({ id: p.id, to: `/catalog/${p.id}`, title: p.nameUz, meta: p.code ?? undefined })),
      };
    },
  });

  return { groups: enabled ? (query.data ?? EMPTY) : EMPTY, loading: enabled && query.isFetching };
}
