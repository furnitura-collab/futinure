import { useQuery } from '@tanstack/react-query';
import { AlarmClock, CreditCard, Scale, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatDate, formatPhone } from '@mebel/shared';
import { BalanceText } from '@/components/BalanceText';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { PageSkeleton } from '@/components/PageSkeleton';
import { SectionCard } from '@/components/SectionCard';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { CustomerDetail } from '@/lib/types';
import { AdjustDialog, RefundDialog } from './FinanceDialogs';
import { LedgerTable } from './LedgerTable';
import { ProfileCard } from './ProfileCard';
import { ReconciliationView } from './ReconciliationView';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api<CustomerDetail>(`/admin/customers/${id}`),
  });
  if (isPending) return <PageSkeleton cards={4} />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return <CustomerView key={data.id} customer={data} />;
}

function CustomerView({ customer: c }: { customer: CustomerDetail }) {
  const { t, money } = useI18n();
  const { can } = useAuth();
  const [dialog, setDialog] = useState<'refund' | 'adjust' | null>(null);
  const f = c.finance;

  return (
    <div>
      <PageHeader
        back={{ to: '/customers', label: t('customer.back') }}
        title={c.customerProfile?.companyName || c.fullName || formatPhone(c.phone)}
      >
        {can('SUPER_ADMIN') && (
          <>
            <Button variant="outline" onClick={() => setDialog('adjust')}>
              {t('customer.adjust')}
            </Button>
            {f.balance < 0 && (
              <Button variant="outline" onClick={() => setDialog('refund')}>
                {t('customer.refund')}
              </Button>
            )}
          </>
        )}
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            <StatCard label={t('customer.balance')} value={<BalanceText value={f.balance} />} icon={Scale} tone={f.balance > 0 ? 'warning' : 'success'} />
            <StatCard label={t('customer.creditLimit')} value={money(f.creditLimit)} icon={CreditCard} tone="info" />
            <StatCard label={t('customer.overdue')} value={money(f.overdueAmount)} icon={AlarmClock} tone="destructive" emphasize={f.overdueAmount > 0} />
            <StatCard label={t('customer.turnover')} value={money(c.stats.turnover)} icon={TrendingUp} tone="primary" />
          </div>

          <Tabs defaultValue="ledger" className="gap-4">
            <TabsList variant="line" className="w-full justify-start border-b">
              <TabsTrigger value="ledger" className="flex-none">{t('customer.ledger')}</TabsTrigger>
              <TabsTrigger value="reconciliation" className="flex-none">{t('customer.reconciliation')}</TabsTrigger>
            </TabsList>
            <TabsContent value="ledger" className="animate-fade-up">
              <LedgerTable customerId={c.id} />
            </TabsContent>
            <TabsContent value="reconciliation" className="animate-fade-up">
              <ReconciliationView customerId={c.id} />
            </TabsContent>
          </Tabs>

          <SectionCard title={t('customer.recentOrders')} flush>
            {c.recentOrders.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">{t('customer.noOrders')}</p>
            ) : (
              <ul className="divide-y">
                {c.recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/orders/${o.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/60"
                    >
                      <span className="font-mono font-medium text-primary">{o.number}</span>
                      <StatusBadge kind="orderStatus" value={o.status} />
                      <span className="ml-auto font-medium tabular">{money(o.grandTotal)}</span>
                      {o.dueDate && <span className="text-xs text-muted-foreground">{t('customer.due', { date: formatDate(o.dueDate) })}</span>}
                      <span className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <ProfileCard customer={c} />
      </div>

      {dialog === 'refund' && <RefundDialog customer={c} onClose={() => setDialog(null)} />}
      {dialog === 'adjust' && <AdjustDialog customer={c} onClose={() => setDialog(null)} />}
    </div>
  );
}
