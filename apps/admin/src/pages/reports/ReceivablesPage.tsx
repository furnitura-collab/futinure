import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { formatPhone } from '@mebel/shared';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { SealCheck } from '@/components/icons';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import type { Receivables } from '@/lib/types';

type Row = Receivables['customers'][number];

/** Debitorlik: kim qancha qarz (eng kattasi birinchi) */
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
        <div className="min-w-0 sm:min-w-40">
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
      cell: (r) => <span className="font-medium whitespace-nowrap tabular">{money(r.balance)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader title={t('receivables.title')} description={t('receivables.subtitle')} />
      {/* Telefonda 2 tadan, raqamlar kichikroq — uzun summa kartaga sig'adi */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3">
        <StatCard label={t('receivables.total')} value={<span className="max-sm:text-base">{money(data?.totalReceivable ?? 0)}</span>} tone="warning" emphasize={!!data?.totalReceivable} loading={isPending} />
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
        empty={{ icon: SealCheck, title: t('receivables.empty') }}
      />
    </div>
  );
}
