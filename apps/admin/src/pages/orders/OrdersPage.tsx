import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, Columns3, FileClock, Inbox, List, MessageCircle, Receipt, Store, Truck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { formatDateTime, formatPhone, type OrderStatus } from '@mebel/shared';
import { DataTable, type Column } from '@/components/DataTable';
import { ErrorState } from '@/components/ErrorState';
import { MANAGERS } from '@/components/nav';
import { OptionSelect } from '@/components/OptionSelect';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ago, customerName } from '@/lib/format';
import { useDebounced, usePendingPayments } from '@/lib/hooks';
import type { KanbanColumn, OrderCard, Paginated } from '@/lib/types';
import { cn } from '@/lib/utils';

type Scope = 'all' | 'mine' | 'none';
type Filters = { q?: string; managerId?: string };

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

      {view === 'board' ? <Board query={kanban} /> : <OrdersTable filters={filters} />}
    </div>
  );
}

function OrderStats({ columns, loading }: { columns?: KanbanColumn[]; loading: boolean }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const isManager = can(...MANAGERS);
  const pending = usePendingPayments(isManager);
  const count = (...statuses: OrderStatus[]) => columns?.filter((c) => statuses.includes(c.status)).reduce((s, c) => s + c.total, 0) ?? 0;

  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:gap-4', isManager ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
      <StatCard label={t('orders.stats.new')} hint={t('orders.stats.newHint')} value={count('NEW')} icon={Inbox} tone="info" loading={loading} />
      <StatCard label={t('orders.stats.quoted')} hint={t('orders.stats.quotedHint')} value={count('QUOTED')} icon={FileClock} tone="violet" loading={loading} />
      <StatCard
        label={t('orders.stats.inProgress')}
        hint={t('orders.stats.inProgressHint')}
        value={count('CONFIRMED', 'PREPARING', 'READY')}
        icon={ClipboardCheck}
        tone="primary"
        loading={loading}
      />
      <StatCard label={t('orders.stats.onTheWay')} hint={t('orders.stats.onTheWayHint')} value={count('OUT_FOR_DELIVERY')} icon={Truck} tone="teal" loading={loading} />
      {isManager && (
        <StatCard
          label={t('orders.stats.pendingPayments')}
          hint={t('orders.stats.pendingPaymentsHint')}
          value={pending.data ?? 0}
          icon={Receipt}
          tone="warning"
          loading={pending.isPending}
          to="/payments"
          emphasize={!!pending.data}
        />
      )}
    </div>
  );
}

function Board({ query }: { query: ReturnType<typeof useKanban> }) {
  const { t } = useI18n();
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-8 lg:scroll-px-8 lg:px-8">
      {query.isPending
        ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-96 w-72 shrink-0 rounded-xl" />)
        : query.data.map((col) => (
            <section key={col.status} className="flex max-h-[calc(100dvh-20rem)] min-h-48 w-[17.5rem] shrink-0 snap-start flex-col rounded-xl border bg-muted/40">
              <header className="flex items-center justify-between px-3 py-2.5">
                <StatusBadge kind="orderStatus" value={col.status} />
                <span className="text-xs font-medium text-muted-foreground tabular">{col.total}</span>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {col.items.map((o) => (
                  <BoardCard key={o.id} order={o} />
                ))}
                {col.items.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{t('orders.columnEmpty')}</p>}
                {col.total > col.items.length && (
                  <p className="py-2 text-center text-xs text-muted-foreground">{t('orders.more', { n: col.total - col.items.length })}</p>
                )}
              </div>
            </section>
          ))}
    </div>
  );
}

function BoardCard({ order: o }: { order: OrderCard }) {
  const { t, money, label } = useI18n();
  const waitingQuote = o.status === 'QUOTED' && o.currentQuote?.status === 'PENDING';
  return (
    <Link
      to={`/orders/${o.id}`}
      className="block rounded-lg border bg-card p-3 shadow-xs transition-[border-color,box-shadow,transform] duration-150 ease-out outline-none hover:-translate-y-px hover:border-primary/40 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono font-medium text-foreground">{o.number}</span>
        <span title={formatDateTime(o.updatedAt)}>{ago(o.updatedAt, t)}</span>
      </div>
      <p className="mt-1.5 truncate text-sm font-medium">{customerName(o.customer)}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold tabular">{money(o.grandTotal)}</span>
        <span className="flex items-center gap-2 text-muted-foreground">
          {o.deliveryType === 'DELIVERY' ? <Truck className="size-4" /> : <Store className="size-4" />}
          {o.unreadMessages > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              <MessageCircle className="size-3" /> {o.unreadMessages}
            </span>
          )}
        </span>
      </div>
      {(waitingQuote || o.paymentTerms || (o.balanceDue > 0 && o.paidTotal > 0) || !o.manager) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {waitingQuote && <Badge variant="violet">{t('orders.awaitingReply')}</Badge>}
          {o.paymentTerms && <Badge>{label('paymentTerms', o.paymentTerms)}</Badge>}
          {o.balanceDue > 0 && o.paidTotal > 0 && <Badge variant="warning">{t('orders.balance', { amount: money(o.balanceDue) })}</Badge>}
          {!o.manager && <Badge variant="destructive">{t('orders.noManager')}</Badge>}
        </div>
      )}
    </Link>
  );
}

function OrdersTable({ filters }: { filters: Filters }) {
  const { t, money } = useI18n();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['orders', 'list', filters, page],
    queryFn: () => api<Paginated<OrderCard>>('/admin/orders', { query: { ...filters, page, limit: 30 } }),
    placeholderData: (prev) => prev,
  });

  const columns: Column<OrderCard>[] = [
    {
      id: 'number',
      header: t('orders.number'),
      cell: (o) => <span className="font-mono font-medium text-primary">{o.number}</span>,
      sortValue: (o) => o.number,
    },
    {
      id: 'customer',
      header: t('orders.customer'),
      cell: (o) => (
        <div className="min-w-40">
          <p className="font-medium">{customerName(o.customer)}</p>
          <p className="text-xs text-muted-foreground">{formatPhone(o.customer.phone)}</p>
        </div>
      ),
      sortValue: (o) => customerName(o.customer),
    },
    { id: 'status', header: t('common.status'), cell: (o) => <StatusBadge kind="orderStatus" value={o.status} /> },
    {
      id: 'total',
      header: t('orders.grandTotal'),
      align: 'right',
      cell: (o) => <span className="font-medium whitespace-nowrap tabular">{money(o.grandTotal)}</span>,
      sortValue: (o) => o.grandTotal,
    },
    {
      id: 'paid',
      header: t('orders.paid'),
      align: 'right',
      hideBelow: 'md',
      cell: (o) => (
        <span className={cn('whitespace-nowrap tabular', o.balanceDue > 0 && o.status !== 'CANCELLED' && 'text-warning')}>{money(o.paidTotal)}</span>
      ),
      sortValue: (o) => o.paidTotal,
    },
    { id: 'manager', header: t('orders.manager'), hideBelow: 'lg', cell: (o) => <span className="text-muted-foreground">{o.manager?.fullName ?? '—'}</span> },
    {
      id: 'date',
      header: t('orders.createdAt'),
      hideBelow: 'sm',
      cell: (o) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(o.createdAt)}</span>,
      sortValue: (o) => o.createdAt,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={data?.items}
      rowKey={(o) => o.id}
      loading={isPending || isFetching}
      error={error}
      onRetry={() => void refetch()}
      onRowClick={(o) => navigate(`/orders/${o.id}`)}
      empty={{ title: t('orders.empty'), description: t('orders.emptyHint') }}
      pagination={data && { page, total: data.total, limit: data.limit, onPage: setPage }}
    />
  );
}
