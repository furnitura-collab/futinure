import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatDateTime } from '@mebel/shared';
import { BalanceText } from '@/components/BalanceText';
import { DataTable, type Column } from '@/components/DataTable';
import { BookOpen } from '@/components/icons';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import type { LedgerEntry, Paginated } from '@/lib/types';
import { cn } from '@/lib/utils';

export function LedgerTable({ customerId }: { customerId: string }) {
  const { t, money } = useI18n();
  const [page, setPage] = useState(1);
  const { data, isPending, isFetching, error } = useQuery({
    queryKey: ['ledger', customerId, page],
    queryFn: () => api<Paginated<LedgerEntry>>(`/admin/customers/${customerId}/ledger`, { query: { page, limit: 20 } }),
    placeholderData: keepPreviousData,
  });

  const description = (e: LedgerEntry) =>
    e.order ? (
      <Link to={`/orders/${e.order.id}`} className="text-primary hover:underline" onClick={(ev) => ev.stopPropagation()}>
        {e.description}
      </Link>
    ) : (
      e.description
    );
  const amount = (e: LedgerEntry) => (
    <span className={cn('font-medium whitespace-nowrap tabular', e.amount > 0 ? 'text-warning' : 'text-success')}>
      {e.amount > 0 ? '+' : '−'}
      {money(Math.abs(e.amount))}
    </span>
  );

  const columns: Column<LedgerEntry>[] = [
    {
      id: 'date',
      header: t('common.date'),
      // Telefon kartasi: 1-qator — izoh va summa, 2-qator — sana, tur va keyingi qoldiq (boshqa ustunlar yashirin)
      cell: (e) => (
        <>
          <span className="whitespace-nowrap text-muted-foreground max-sm:hidden">{formatDateTime(e.createdAt)}</span>
          <div className="space-y-0.5 sm:hidden">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">{description(e)}</span>
              {amount(e)}
            </div>
            <p className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
              <span>
                {formatDateTime(e.createdAt)} · {t(`ledger.types.${e.type}`)}
              </span>
              <BalanceText value={e.balanceAfter} />
            </p>
          </div>
        </>
      ),
    },
    { id: 'type', header: t('ledger.type'), hideBelow: 'sm', cell: (e) => t(`ledger.types.${e.type}`) },
    { id: 'description', header: t('ledger.description'), hideBelow: 'sm', cell: description },
    { id: 'amount', header: t('common.amount'), align: 'right', hideBelow: 'sm', cell: amount },
    {
      id: 'balance',
      header: t('ledger.balanceAfter'),
      align: 'right',
      hideBelow: 'md',
      cell: (e) => (
        <span className="whitespace-nowrap">
          <BalanceText value={e.balanceAfter} />
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={data?.items}
      rowKey={(e) => e.id}
      loading={isPending || isFetching}
      error={error}
      empty={{ icon: BookOpen, title: t('ledger.empty') }}
      pagination={data && { page, total: data.total, limit: data.limit, onPage: setPage }}
    />
  );
}
