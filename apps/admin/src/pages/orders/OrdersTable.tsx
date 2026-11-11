import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { formatDateTime, formatPhone } from '@mebel/shared';
import { DataTable, type Column } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { customerName } from '@/lib/format';
import type { OrderCard, Paginated } from '@/lib/types';
import { cn } from '@/lib/utils';

export type Filters = { q?: string; managerId?: string };

export function OrdersTable({ filters }: { filters: Filters }) {
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
