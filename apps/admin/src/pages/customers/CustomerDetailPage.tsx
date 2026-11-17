import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { PencilLine, Undo } from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { PageSkeleton } from '@/components/PageSkeleton';
import { PhoneLine } from '@/components/PhoneLine';
import { StatCard } from '@/components/StatCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { customerName } from '@/lib/format';
import type { CustomerDetail } from '@/lib/types';
import { CustomerTags } from './CustomerTags';
import { AdjustDialog, RefundDialog } from './FinanceDialogs';
import { LedgerTable } from './LedgerTable';
import { ProfileCard } from './ProfileCard';
import { ReconciliationView } from './ReconciliationView';
import { RecentOrders } from './RecentOrders';

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
  const p = c.customerProfile;

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ to: '/customers', label: t('customer.back') }}
        title={customerName(c)}
        meta={
          <>
            <CustomerTags profile={p} inactive={!c.isActive} />
            <div className="text-sm text-muted-foreground">
              <PhoneLine phone={c.phone} />
            </div>
          </>
        }
      >
        {can('SUPER_ADMIN') && (
          <>
            <IconButton icon={PencilLine} label={t('customer.adjust')} variant="outline" size="icon" side="bottom" onClick={() => setDialog('adjust')} />
            {f.balance < 0 && <IconButton icon={Undo} label={t('customer.refund')} variant="outline" size="icon" side="bottom" onClick={() => setDialog('refund')} />}
          </>
        )}
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label={t('customer.balance')}
              value={money(Math.abs(f.balance))}
              hint={t(f.balance > 0 ? 'balance.debtState' : f.balance < 0 ? 'balance.creditState' : 'balance.settled')}
              tone={f.balance > 0 ? 'warning' : 'success'}
              emphasize={f.balance !== 0}
            />
            <StatCard
              label={t('customer.creditLimit')}
              value={money(f.creditLimit)}
              hint={f.creditLimit > 0 ? t('customer.available', { amount: money(f.availableCredit) }) : undefined}
            />
            <StatCard label={t('customer.overdue')} value={money(f.overdueAmount)} tone="destructive" emphasize={f.overdueAmount > 0} />
            <StatCard label={t('customer.turnover')} value={money(c.stats.turnover)} hint={t('order.ordersCount', { n: c.stats.orders })} />
          </div>

          <Tabs defaultValue="ledger" className="gap-3">
            <TabsList variant="line" className="w-full justify-start border-b">
              <TabsTrigger value="ledger" className="flex-none">
                {t('customer.ledger')}
              </TabsTrigger>
              <TabsTrigger value="orders" className="flex-none">
                {t('customer.orders')}
                <span className="text-xs text-muted-foreground tabular">{c.recentOrders.length}</span>
              </TabsTrigger>
              <TabsTrigger value="reconciliation" className="flex-none">
                {t('customer.reconciliation')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="ledger" className="animate-fade-up">
              <LedgerTable customerId={c.id} />
            </TabsContent>
            <TabsContent value="orders" className="animate-fade-up">
              <RecentOrders orders={c.recentOrders} />
            </TabsContent>
            <TabsContent value="reconciliation" className="animate-fade-up">
              <ReconciliationView customerId={c.id} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Saqlangach server qiymati o'zgaradi — forma yangi holatdan boshlanadi */}
        <ProfileCard key={JSON.stringify([c.fullName, c.isActive, p])} customer={c} />
      </div>

      {dialog === 'refund' && <RefundDialog customer={c} onClose={() => setDialog(null)} />}
      {dialog === 'adjust' && <AdjustDialog customer={c} onClose={() => setDialog(null)} />}
    </div>
  );
}
