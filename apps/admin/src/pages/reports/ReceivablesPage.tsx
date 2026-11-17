import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { formatDate, formatPhone } from '@mebel/shared';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { SealCheck } from '@/components/icons';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import type { Receivables } from '@/lib/types';
import { cn } from '@/lib/utils';

type Row = Receivables['customers'][number];

/** Debitorlik: kim qancha qarz, qanchasi muddati o'tgan (eng xavflisi birinchi) */
export function ReceivablesPage() {
  const { t, money } = useI18n();
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['receivables'],
    queryFn: () => api<Receivables>('/admin/reports/receivables'),
  });

  const columns: Column<Row>[] = [
    {
      id: 'customer',
      header: t('receivables.customer'),
      sortValue: (r) => r.company_name || r.full_name || r.phone,
      cell: (r) => (
        <div className="min-w-40">
          <p className="font-medium">{r.company_name || r.full_name || '—'}</p>
          <p className="text-xs text-muted-foreground">{formatPhone(r.phone)}</p>
        </div>
      ),
    },
    {
      id: 'debt',
      header: t('receivables.debt'),
      align: 'right',
      sortValue: (r) => r.balance,
      cell: (r) => (
        <span className={cn('font-medium whitespace-nowrap tabular', r.credit_limit > 0 && r.balance > r.credit_limit && 'text-destructive')}>{money(r.balance)}</span>
      ),
    },
    {
      id: 'overdue',
      header: t('receivables.overdue'),
      align: 'right',
      sortValue: (r) => r.overdue,
      cell: (r) => (
        <span className={cn('whitespace-nowrap tabular', r.overdue > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{money(r.overdue)}</span>
      ),
    },
    {
      id: 'oldest',
      header: t('receivables.oldestDue'),
      hideBelow: 'sm',
      sortValue: (r) => r.oldest_due,
      cell: (r) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(r.oldest_due)}</span>,
    },
    {
      id: 'limit',
      header: t('receivables.limit'),
      align: 'right',
      hideBelow: 'md',
      sortValue: (r) => r.credit_limit,
      cell: (r) => <span className="whitespace-nowrap text-muted-foreground tabular">{money(r.credit_limit)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader title={t('receivables.title')} description={t('receivables.subtitle')} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label={t('receivables.total')} value={money(data?.totalReceivable ?? 0)} tone="warning" emphasize={!!data?.totalReceivable} loading={isPending} />
        <StatCard
          label={t('receivables.overdue')}
          value={money(data?.totalOverdue ?? 0)}
          tone="destructive"
          emphasize={!!data?.totalOverdue}
          loading={isPending}
        />
        <StatCard label={t('receivables.debtors')} value={data?.customers.length ?? 0} loading={isPending} />
      </div>
      <DataTable
        columns={columns}
        rows={data?.customers}
        rowKey={(r) => r.customer_id}
        loading={isPending}
        error={error}
        onRetry={() => void refetch()}
        onRowClick={(r) => navigate(`/customers/${r.customer_id}`)}
        rowClassName={(r) => r.overdue > 0 && 'bg-destructive/[0.04]'}
        empty={{ icon: SealCheck, title: t('receivables.empty') }}
      />
    </div>
  );
}
