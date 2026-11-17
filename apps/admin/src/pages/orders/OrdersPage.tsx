import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ORDER_STATUSES } from '@mebel/shared';
import { FilterBar } from '@/components/FilterBar';
import { Board, List } from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { Segmented } from '@/components/Segmented';
import { Toolbar } from '@/components/Toolbar';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/hooks';
import type { KanbanColumn } from '@/lib/types';
import { isOrderStatus } from './board/rules';
import { OrdersBoard } from './board/OrdersBoard';
import { OrdersTable, type Filters } from './OrdersTable';

const SCOPES = ['all', 'mine', 'none'] as const;
type Scope = (typeof SCOPES)[number];
const isScope = (v: string | null): v is Scope => SCOPES.includes(v as Scope);

/** Buyurtmalar: kanban (sudrab status o'zgartirish) yoki jadval; filtrlar URL'da — havola bilan ulashiladi */
export function OrdersPage() {
  const { t, label } = useI18n();
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'list' ? 'list' : 'board';
  const scopeParam = params.get('scope');
  const scope: Scope = isScope(scopeParam) ? scopeParam : 'all';
  const statusParam = params.get('status');
  const status = isOrderStatus(statusParam) ? statusParam : undefined;
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = useDebounced(q.trim());

  const filters: Filters = {
    q: query.length >= 2 ? query : undefined,
    managerId: scope === 'mine' ? me?.id : scope === 'none' ? 'none' : undefined,
  };
  const set = (k: string, v: string | null) =>
    setParams((p) => {
      if (v) p.set(k, v);
      else p.delete(k);
      return p;
    });

  // Ustunlar soni jadvaldagi status filtrida ham ishlatiladi — bitta so'rov
  const kanban = useQuery({
    queryKey: ['orders', 'kanban', filters],
    queryFn: () => api<KanbanColumn[]>('/admin/orders/kanban', { query: filters }),
  });
  const counts = new Map(kanban.data?.map((c) => [c.status, c.total]));

  return (
    <div className="space-y-4">
      {/* Telefonda ham sarlavha va ko'rinish tugmasi bitta qatorda */}
      <PageHeader title={t('orders.title')}>
        <Segmented
          label={t('orders.view')}
          value={view}
          onChange={(v) => set('view', v === 'list' ? 'list' : null)}
          options={[
            { value: 'board', label: t('orders.board'), icon: Board },
            { value: 'list', label: t('orders.table'), icon: List },
          ]}
        />
      </PageHeader>
      <Toolbar>
        <FilterBar
          search={<SearchInput value={q} onChange={setQ} placeholder={t('orders.search')} loading={kanban.isFetching && !!filters.q} />}
          onReset={() =>
            setParams((p) => {
              p.delete('scope');
              p.delete('status');
              return p;
            })
          }
          filters={[
            {
              id: 'scope',
              label: t('orders.manager'),
              active: scope !== 'all',
              node: (
                <Segmented
                  label={t('orders.manager')}
                  value={scope}
                  onChange={(v) => set('scope', v === 'all' ? null : v)}
                  options={[
                    { value: 'all', label: t('orders.scopeAll') },
                    { value: 'mine', label: t('orders.scopeMine') },
                    { value: 'none', label: t('orders.scopeNone') },
                  ]}
                />
              ),
            },
            ...(view === 'list'
              ? [
                  {
                    id: 'status',
                    label: t('orders.statusFilter'),
                    active: !!status,
                    node: (
                      <Segmented
                        label={t('orders.statusFilter')}
                        value={status ?? 'all'}
                        onChange={(v) => set('status', v === 'all' ? null : v)}
                        options={[
                          { value: 'all', label: t('orders.statusAll') },
                          ...ORDER_STATUSES.map((s) => ({ value: s, label: label('orderStatus', s), count: counts.get(s) })),
                        ]}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Toolbar>
      {view === 'board' ? <OrdersBoard query={kanban} /> : <OrdersTable filters={{ ...filters, status }} />}
    </div>
  );
}
