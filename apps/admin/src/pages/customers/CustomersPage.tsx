import { useQuery } from '@tanstack/react-query';
import { UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { formatDateTime, formatPhone } from '@mebel/shared';
import { BalanceText } from '@/components/BalanceText';
import { DataTable, type Column } from '@/components/DataTable';
import { OptionSelect } from '@/components/OptionSelect';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { SwitchField } from '@/components/SwitchField';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { usePriceGroups } from '@/lib/catalog';
import { useDebounced } from '@/lib/hooks';
import type { CustomerRow, Paginated } from '@/lib/types';

export function CustomersPage() {
  const { t, money, label } = useI18n();
  const navigate = useNavigate();
  const groups = usePriceGroups();
  const [q, setQ] = useState('');
  const [priceGroupId, setPriceGroupId] = useState('');
  const [debtors, setDebtors] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const query = useDebounced(q.trim());
  const filters = {
    q: query.length >= 2 ? query : undefined,
    priceGroupId: priceGroupId || undefined,
    debtors: debtors || undefined,
    overdue: overdue || undefined,
  };
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['customers', filters, page],
    queryFn: () => api<Paginated<CustomerRow>>('/admin/customers', { query: { ...filters, page, limit: 30 } }),
    placeholderData: (prev) => prev,
  });
  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const columns: Column<CustomerRow>[] = [
    {
      id: 'customer',
      header: t('customers.customer'),
      sortValue: (c) => c.customerProfile?.companyName || c.fullName || c.phone,
      cell: (c) => {
        const p = c.customerProfile;
        return (
          <div className="min-w-40">
            <p className="font-medium">{p?.companyName || c.fullName || '—'}</p>
            <p className="text-xs text-muted-foreground">
              {p?.companyName && c.fullName ? `${c.fullName} · ` : ''}
              {formatPhone(c.phone)}
            </p>
          </div>
        );
      },
    },
    {
      id: 'type',
      header: t('customers.typeGroup'),
      hideBelow: 'md',
      cell: (c) => {
        const p = c.customerProfile;
        return (
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            {p ? label('customerType', p.type) : '—'}
            {p?.priceGroup && <Badge variant="primary">{p.priceGroup.name}</Badge>}
          </div>
        );
      },
    },
    {
      id: 'balance',
      header: t('customers.balance'),
      align: 'right',
      sortValue: (c) => c.customerProfile?.balanceCached ?? 0,
      cell: (c) => <span className="whitespace-nowrap tabular"><BalanceText value={c.customerProfile?.balanceCached ?? 0} /></span>,
    },
    {
      id: 'limit',
      header: t('customers.limit'),
      align: 'right',
      hideBelow: 'lg',
      sortValue: (c) => c.customerProfile?.creditLimit ?? 0,
      cell: (c) => <span className="whitespace-nowrap text-muted-foreground tabular">{c.customerProfile?.creditLimit ? money(c.customerProfile.creditLimit) : '—'}</span>,
    },
    { id: 'orders', header: t('customers.orders'), align: 'right', hideBelow: 'sm', sortValue: (c) => c._count.orders, cell: (c) => c._count.orders },
    {
      id: 'login',
      header: t('customers.lastLogin'),
      hideBelow: 'lg',
      sortValue: (c) => c.lastLoginAt,
      cell: (c) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(c.lastLoginAt)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader title={t('customers.title')} description={t('customers.subtitle')} />
      <div className="mb-4 flex flex-col flex-wrap gap-3 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={resetPage(setQ)} placeholder={t('customers.search')} loading={isFetching && !!filters.q} />
        <OptionSelect
          className="sm:w-48"
          aria-label={t('customer.priceGroup')}
          value={priceGroupId}
          onValueChange={resetPage(setPriceGroupId)}
          emptyLabel={t('customers.allGroups')}
          options={(groups.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
        />
        <SwitchField checked={debtors} onCheckedChange={resetPage(setDebtors)} label={t('customers.debtors')} />
        <SwitchField checked={overdue} onCheckedChange={resetPage(setOverdue)} label={t('customers.overdue')} />
      </div>
      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(c) => c.id}
        loading={isPending || isFetching}
        error={error}
        onRetry={() => void refetch()}
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
        rowClassName={(c) => !c.isActive && 'opacity-50'}
        empty={{ icon: UsersRound, title: t('customers.empty') }}
        pagination={data && { page, total: data.total, limit: data.limit, onPage: setPage }}
      />
    </div>
  );
}
