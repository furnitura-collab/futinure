import { Link } from 'react-router';
import { formatDate } from '@mebel/shared';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/i18n';
import type { CustomerDetail } from '@/lib/types';

export function RecentOrders({ orders }: { orders: CustomerDetail['recentOrders'] }) {
  const { t, money } = useI18n();
  return (
    <Card className="gap-0 overflow-hidden py-0">
      {orders.length === 0 ? (
        <EmptyState title={t('customer.noOrders')} />
      ) : (
        <ul className="divide-y">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                to={`/orders/${o.id}`}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm max-sm:py-3 transition-colors outline-none hover:bg-primary/4 focus-visible:bg-primary/6 sm:grid-cols-[9rem_1fr_auto_6rem]"
              >
                <span className="font-mono font-medium text-primary">{o.number}</span>
                <span>
                  <StatusBadge kind="orderStatus" value={o.status} />
                </span>
                <span className="text-right font-medium tabular">{money(o.grandTotal)}</span>
                <span className="col-span-3 text-xs text-muted-foreground sm:col-span-1 sm:text-right">
                  {o.dueDate ? t('customer.due', { date: formatDate(o.dueDate) }) : formatDate(o.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
