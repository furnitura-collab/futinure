import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { PaymentStatus } from '@mebel/shared';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { ResponsiveTabs } from '@/components/ResponsiveTabs';
import { ReceiptText } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n, type TKey } from '@/i18n';
import { api } from '@/lib/api';
import { usePendingPayments } from '@/lib/hooks';
import type { Paginated, PaymentRow } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PaymentItem } from './PaymentItem';

type Tab = PaymentStatus | 'ALL';
const TABS: { value: Tab; label: TKey }[] = [
  { value: 'PENDING', label: 'payments.pending' },
  { value: 'CONFIRMED', label: 'payments.confirmed' },
  { value: 'REJECTED', label: 'payments.rejected' },
  { value: 'ALL', label: 'payments.all' },
];

export function PaymentsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('PENDING');
  const [page, setPage] = useState(1);
  // Faqat "tekshirish kerak" soni arzon (menyu nishoni bilan bitta kesh) — boshqa tablar uchun alohida so'rov yo'q
  const pending = usePendingPayments(true);
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['payments', tab, page],
    queryFn: () => api<Paginated<PaymentRow>>('/admin/payments', { query: { status: tab === 'ALL' ? undefined : tab, page, limit: 20 } }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader title={t('payments.title')} description={t('payments.subtitle')} />
      <ResponsiveTabs
        className="mb-3"
        label={t('payments.title')}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setPage(1);
        }}
        options={TABS.map((x) => ({ value: x.value, label: t(x.label), ...(x.value === 'PENDING' && { count: pending.data ?? 0, urgent: true }) }))}
      />

      {isPending ? (
        <Card className="gap-0 divide-y py-0">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2 px-4 py-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </Card>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={tab === 'PENDING' ? t('payments.emptyPending') : t('payments.empty')}
          description={tab === 'PENDING' ? t('payments.emptyPendingHint') : undefined}
        />
      ) : (
        <Card className={cn('gap-0 py-0 transition-opacity', isFetching && 'opacity-60')}>
          <ul className="divide-y">
            {data.items.map((p) => (
              <PaymentItem key={p.id} payment={p} />
            ))}
          </ul>
        </Card>
      )}

      {data && <Pagination className="mt-4" page={page} total={data.total} limit={data.limit} onPage={setPage} />}
    </div>
  );
}
