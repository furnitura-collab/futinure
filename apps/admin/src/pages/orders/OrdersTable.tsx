import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { formatDateTime, formatPhone, type OrderStatus } from '@mebel/shared';
import { DataTable, type Column } from '@/components/DataTable';
import { Hint } from '@/components/IconButton';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { ago, customerName } from '@/lib/format';
import type { OrderCard, Paginated } from '@/lib/types';
import { PAY_TONE, payState } from './payment';

export type Filters = { q?: string; managerId?: string; status?: OrderStatus };

export function OrdersTable({ filters }: { filters: Filters }) {
  const { t, money } = useI18n();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['orders', 'list', filters, page],
    queryFn: () => api<Paginated<OrderCard>>('/admin/orders', { query: { ...filters, page, limit: 30 } }),
    placeholderData: keepPreviousData,
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
      id: 'payment',
      header: t('orders.payment'),
      hideBelow: 'md',
      cell: (o) => {
        const state = payState(o);
        return (
          <Hint label={t('orders.paidOf', { paid: money(o.paidTotal), total: money(o.grandTotal) })}>
            <Badge variant={PAY_TONE[state]}>{t(`orders.pay.${state}`)}</Badge>
          </Hint>
        );
      },
      sortValue: (o) => o.grandTotal - o.paidTotal,
    },
    { id: 'manager', header: t('orders.manager'), hideBelow: 'lg', cell: (o) => <span className="text-muted-foreground">{o.manager?.fullName ?? '—'}</span> },
    {
      id: 'date',
      header: t('orders.createdAt'),
      hideBelow: 'sm',
      cell: (o) => (
        <Hint label={formatDateTime(o.createdAt)}>
          <span className="whitespace-nowrap text-muted-foreground">{ago(o.createdAt, t)}</span>
        </Hint>
      ),
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
