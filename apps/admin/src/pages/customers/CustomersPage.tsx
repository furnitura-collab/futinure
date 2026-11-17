import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { formatDateTime, formatPhone } from '@mebel/shared';
import { BalanceText } from '@/components/BalanceText';
import { DataTable, type Column } from '@/components/DataTable';
import { Hint } from '@/components/IconButton';
import { Identity } from '@/components/Identity';
import { UsersRound } from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { Segmented } from '@/components/Segmented';
import { Toolbar } from '@/components/Toolbar';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { usePriceGroups } from '@/lib/catalog';
import { ago } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import type { CustomerRow, Paginated } from '@/lib/types';
import { CustomerTags } from './CustomerTags';

const DEBTS = ['all', 'debtors', 'overdue'] as const;
type Debt = (typeof DEBTS)[number];
const isDebt = (v: string | null): v is Debt => DEBTS.includes(v as Debt);

/** Mijozlar: qidiruv, qarz va narx guruhi filtrlari (URL'da), balans va limit */
export function CustomersPage() {
  const { t, money } = useI18n();
  const navigate = useNavigate();
  const groups = usePriceGroups();
  const [params, setParams] = useSearchParams();
  const debtParam = params.get('debt');
  const debt: Debt = isDebt(debtParam) ? debtParam : 'all';
  const group = params.get('group') ?? 'all';
  const page = Number(params.get('page')) || 1;
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = useDebounced(q.trim());

  const set = (k: string, v: string | null) =>
    setParams((p) => {
      if (v) p.set(k, v);
      else p.delete(k);
      if (k !== 'page') p.delete('page');
      return p;
    });
  const filters = {
    q: query.length >= 2 ? query : undefined,
    priceGroupId: group === 'all' ? undefined : group,
    debtors: debt === 'debtors' || undefined,
    overdue: debt === 'overdue' || undefined,
  };
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['customers', filters, page],
    queryFn: () => api<Paginated<CustomerRow>>('/admin/customers', { query: { ...filters, page, limit: 30 } }),
    placeholderData: keepPreviousData,
  });

  const columns: Column<CustomerRow>[] = [
    {
      id: 'customer',
      header: t('customers.customer'),
      sortValue: (c) => c.customerProfile?.companyName || c.fullName || c.phone,
      cell: (c) => {
        const company = c.customerProfile?.companyName;
        return (
          <Identity
            className="min-w-48"
            name={company || c.fullName}
            phone={c.phone}
            muted={!c.isActive}
            subtitle={`${company && c.fullName ? `${c.fullName} · ` : ''}${formatPhone(c.phone)}`}
          />
        );
      },
    },
    {
      id: 'type',
      header: t('customers.typeGroup'),
      hideBelow: 'md',
      cell: (c) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <CustomerTags profile={c.customerProfile} inactive={!c.isActive} />
        </div>
      ),
    },
    {
      id: 'balance',
      header: t('customers.balance'),
      align: 'right',
      sortValue: (c) => c.customerProfile?.balanceCached ?? 0,
      cell: (c) => (
        <span className="whitespace-nowrap tabular">
          <BalanceText value={c.customerProfile?.balanceCached ?? 0} />
        </span>
      ),
    },
    {
      id: 'limit',
      header: t('customers.limit'),
      align: 'right',
      hideBelow: 'lg',
      sortValue: (c) => c.customerProfile?.creditLimit ?? 0,
      cell: (c) => (
        <span className="whitespace-nowrap text-muted-foreground tabular">{c.customerProfile?.creditLimit ? money(c.customerProfile.creditLimit) : '—'}</span>
      ),
    },
    {
      id: 'orders',
      header: t('customers.orders'),
      align: 'right',
      hideBelow: 'sm',
      className: 'tabular',
      sortValue: (c) => c._count.orders,
      cell: (c) => <span className={c._count.orders ? undefined : 'text-muted-foreground'}>{c._count.orders}</span>,
    },
    {
      id: 'login',
      header: t('customers.lastLogin'),
      align: 'right',
      hideBelow: 'lg',
      sortValue: (c) => c.lastLoginAt,
      cell: (c) =>
        c.lastLoginAt ? (
          <Hint label={formatDateTime(c.lastLoginAt)}>
            <span className="whitespace-nowrap text-muted-foreground">{ago(c.lastLoginAt, t)}</span>
          </Hint>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title={t('customers.title')} />
      <Toolbar>
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            if (page > 1) set('page', null);
          }}
          placeholder={t('customers.search')} loading={isFetching && !!filters.q} />
        <Segmented
          label={t('customers.debtFilter')}
          value={debt}
          onChange={(v) => set('debt', v === 'all' ? null : v)}
          options={[
            { value: 'all', label: t('customers.debtAll') },
            { value: 'debtors', label: t('customers.debtors') },
            { value: 'overdue', label: t('customers.overdue') },
          ]}
        />
        {!!groups.data?.length && (
          <Segmented
            label={t('customer.priceGroup')}
            value={group}
            onChange={(v) => set('group', v === 'all' ? null : v)}
            options={[{ value: 'all', label: t('customers.allGroups') }, ...groups.data.map((g) => ({ value: g.id, label: g.name }))]}
          />
        )}
      </Toolbar>
      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(c) => c.id}
        loading={isPending || isFetching}
        error={error}
        onRetry={() => void refetch()}
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
        empty={{ icon: UsersRound, title: t('customers.empty') }}
        pagination={data && { page, total: data.total, limit: data.limit, onPage: (p) => set('page', p > 1 ? String(p) : null) }}
      />
    </div>
  );
}
