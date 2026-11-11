import { useQuery } from '@tanstack/react-query';
import { Columns3, List } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { OptionSelect } from '@/components/OptionSelect';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/hooks';
import type { KanbanColumn } from '@/lib/types';
import { OrdersBoard } from './OrdersBoard';
import { OrderStats } from './OrderStats';
import { OrdersTable, type Filters } from './OrdersTable';

type Scope = 'all' | 'mine' | 'none';

const isScope = (v: string | null): v is Scope => v === 'all' || v === 'mine' || v === 'none';

function useKanban(filters: Filters) {
  return useQuery({
    queryKey: ['orders', 'kanban', filters],
    queryFn: () => api<KanbanColumn[]>('/admin/orders/kanban', { query: filters }),
  });
}

export function OrdersPage() {
  const { t } = useI18n();
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'list' ? 'list' : 'board';
  const scopeParam = params.get('scope');
  const scope: Scope = isScope(scopeParam) ? scopeParam : 'all';
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
  const kanban = useKanban(filters);

  return (
    <div className="space-y-6">
      <PageHeader title={t('orders.title')} description={t('orders.subtitle')} className="mb-0">
        <Tabs value={view} onValueChange={(v) => set('view', v === 'list' ? 'list' : null)}>
          <TabsList>
            <TabsTrigger value="board" className="px-3">
              <Columns3 /> {t('orders.board')}
            </TabsTrigger>
            <TabsTrigger value="list" className="px-3">
              <List /> {t('orders.table')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>

      <OrderStats columns={kanban.data} loading={kanban.isPending} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder={t('orders.search')} loading={kanban.isFetching && !!filters.q} />
        <OptionSelect
          className="sm:w-56"
          aria-label={t('orders.manager')}
          value={scope}
          onValueChange={(v) => set('scope', v === 'all' ? null : v)}
          options={[
            { value: 'all', label: t('orders.scopeAll') },
            { value: 'mine', label: t('orders.scopeMine') },
            { value: 'none', label: t('orders.scopeNone') },
          ]}
        />
      </div>

      {view === 'board' ? <OrdersBoard query={kanban} /> : <OrdersTable filters={filters} />}
    </div>
  );
}
