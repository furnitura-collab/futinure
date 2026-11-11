import type { UseQueryResult } from '@tanstack/react-query';
import { MessageCircle, Store, Truck } from 'lucide-react';
import { Link } from 'react-router';
import { formatDateTime } from '@mebel/shared';
import { ErrorState } from '@/components/ErrorState';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/i18n';
import { ago, customerName } from '@/lib/format';
import type { KanbanColumn, OrderCard } from '@/lib/types';

/** Kanban doska: har bir status — alohida ustun */
export function OrdersBoard({ query }: { query: UseQueryResult<KanbanColumn[]> }) {
  const { t } = useI18n();
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-8 lg:scroll-px-8 lg:px-8">
      {query.isPending
        ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-96 w-72 shrink-0 rounded-xl" />)
        : query.data.map((col) => (
            <section key={col.status} className="flex max-h-[calc(100dvh-20rem)] min-h-48 w-[17.5rem] shrink-0 snap-start flex-col rounded-xl border bg-muted/40">
              <header className="flex items-center justify-between px-3 py-2.5">
                <StatusBadge kind="orderStatus" value={col.status} />
                <span className="text-xs font-medium text-muted-foreground tabular">{col.total}</span>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {col.items.map((o) => (
                  <BoardCard key={o.id} order={o} />
                ))}
                {col.items.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{t('orders.columnEmpty')}</p>}
                {col.total > col.items.length && (
                  <p className="py-2 text-center text-xs text-muted-foreground">{t('orders.more', { n: col.total - col.items.length })}</p>
                )}
              </div>
            </section>
          ))}
    </div>
  );
}

function BoardCard({ order: o }: { order: OrderCard }) {
  const { t, money, label } = useI18n();
  const waitingQuote = o.status === 'QUOTED' && o.currentQuote?.status === 'PENDING';
  return (
    <Link
      to={`/orders/${o.id}`}
      className="block rounded-lg border bg-card p-3 shadow-xs transition-[border-color,box-shadow,transform] duration-150 ease-out outline-none hover:-translate-y-px hover:border-primary/40 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono font-medium text-foreground">{o.number}</span>
        <span title={formatDateTime(o.updatedAt)}>{ago(o.updatedAt, t)}</span>
      </div>
      <p className="mt-1.5 truncate text-sm font-medium">{customerName(o.customer)}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold tabular">{money(o.grandTotal)}</span>
        <span className="flex items-center gap-2 text-muted-foreground">
          {o.deliveryType === 'DELIVERY' ? <Truck className="size-4" /> : <Store className="size-4" />}
          {o.unreadMessages > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              <MessageCircle className="size-3" /> {o.unreadMessages}
            </span>
          )}
        </span>
      </div>
      {(waitingQuote || o.paymentTerms || (o.balanceDue > 0 && o.paidTotal > 0) || !o.manager) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {waitingQuote && <Badge variant="violet">{t('orders.awaitingReply')}</Badge>}
          {o.paymentTerms && <Badge>{label('paymentTerms', o.paymentTerms)}</Badge>}
          {o.balanceDue > 0 && o.paidTotal > 0 && <Badge variant="warning">{t('orders.balance', { amount: money(o.balanceDue) })}</Badge>}
          {!o.manager && <Badge variant="destructive">{t('orders.noManager')}</Badge>}
        </div>
      )}
    </Link>
  );
}
