import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { PaymentStatus } from '@mebel/shared';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { ReceiptText } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
const isTab = (v: string): v is Tab => TABS.some((x) => x.value === v);

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
      <Tabs
        value={tab}
        onValueChange={(v) => {
          if (!isTab(v)) return;
          setTab(v);
          setPage(1);
        }}
        className="mb-3"
      >
        <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
          {TABS.map((x) => (
            <TabsTrigger key={x.value} value={x.value} className="flex-none gap-1.5">
              {t(x.label)}
              {x.value === 'PENDING' && !!pending.data && (
                <span className="rounded-full bg-warning/15 px-1.5 text-[11px] leading-4 font-semibold text-warning tabular">{pending.data}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

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
