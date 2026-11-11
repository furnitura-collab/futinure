import { ClipboardCheck, FileClock, Inbox, Receipt, Truck } from 'lucide-react';
import type { OrderStatus } from '@mebel/shared';
import { MANAGERS } from '@/components/nav';
import { StatCard } from '@/components/StatCard';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { usePendingPayments } from '@/lib/hooks';
import type { KanbanColumn } from '@/lib/types';
import { cn } from '@/lib/utils';

export function OrderStats({ columns, loading }: { columns?: KanbanColumn[]; loading: boolean }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const isManager = can(...MANAGERS);
  const pending = usePendingPayments(isManager);
  const count = (...statuses: OrderStatus[]) => columns?.filter((c) => statuses.includes(c.status)).reduce((s, c) => s + c.total, 0) ?? 0;

  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:gap-4', isManager ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
      <StatCard label={t('orders.stats.new')} hint={t('orders.stats.newHint')} value={count('NEW')} icon={Inbox} tone="info" loading={loading} />
      <StatCard label={t('orders.stats.quoted')} hint={t('orders.stats.quotedHint')} value={count('QUOTED')} icon={FileClock} tone="violet" loading={loading} />
      <StatCard
        label={t('orders.stats.inProgress')}
        hint={t('orders.stats.inProgressHint')}
        value={count('CONFIRMED', 'PREPARING', 'READY')}
        icon={ClipboardCheck}
        tone="primary"
        loading={loading}
      />
      <StatCard label={t('orders.stats.onTheWay')} hint={t('orders.stats.onTheWayHint')} value={count('OUT_FOR_DELIVERY')} icon={Truck} tone="teal" loading={loading} />
      {isManager && (
        <StatCard
          label={t('orders.stats.pendingPayments')}
          hint={t('orders.stats.pendingPaymentsHint')}
          value={pending.data ?? 0}
          icon={Receipt}
          tone="warning"
          loading={pending.isPending}
          to="/payments"
          emphasize={!!pending.data}
        />
      )}
    </div>
  );
}
