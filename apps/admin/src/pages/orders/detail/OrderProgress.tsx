import { formatDate, formatDateTime, type OrderStatus } from '@mebel/shared';
import { Hint } from '@/components/IconButton';
import { Check } from '@/components/icons';
import { useI18n } from '@/i18n';
import type { OrderDetail } from '@/lib/types';
import { cn } from '@/lib/utils';

const DELIVERY_FLOW: OrderStatus[] = ['NEW', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'];
const PICKUP_FLOW = DELIVERY_FLOW.filter((s) => s !== 'OUT_FOR_DELIVERY');

/** Buyurtma bosqichlari: o'tilgan, joriy va keyingilar; har bosqich sanasi tarixdan */
export function OrderProgress({ order }: { order: OrderDetail }) {
  const { t, label } = useI18n();
  if (order.status === 'CANCELLED') return null;

  const flow = order.deliveryType === 'PICKUP' ? PICKUP_FLOW : DELIVERY_FLOW;
  const current = flow.indexOf(order.status);
  const reachedAt = (s: OrderStatus) => order.statusHistory.findLast((h) => h.toStatus === s)?.createdAt;

  return (
    <ol aria-label={t('order.progress')} className="flex min-w-0 flex-1 overflow-x-auto py-1">
      {flow.map((s, i) => {
        const done = i < current;
        const now = i === current;
        const at = reachedAt(s);
        return (
          <li key={s} aria-current={now ? 'step' : undefined} className="relative flex min-w-24 flex-1 flex-col items-center gap-1.5 text-center">
            {i > 0 && (
              // Chiziq doiralarga tegmaydi: ikki tomonda 6px bo'shliq
              <span
                aria-hidden
                className={cn(
                  'absolute top-3.5 right-[calc(50%+1.25rem)] left-[calc(-50%+1.25rem)] h-0.5 -translate-y-1/2 rounded-full',
                  done || now ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
            <span
              className={cn(
                'flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular transition-colors',
                done && 'bg-primary text-primary-foreground',
                now && 'bg-primary/12 text-primary ring-2 ring-primary ring-offset-2 ring-offset-card',
                !done && !now && 'text-muted-foreground ring-1 ring-border ring-inset',
              )}
            >
              {done ? <Check weight="bold" className="size-3.5" /> : i + 1}
            </span>
            <span className={cn('text-xs leading-4', now ? 'font-semibold text-foreground' : done ? 'font-medium' : 'text-muted-foreground')}>
              {label('orderStatus', s)}
            </span>
            {/* Sana qatori doim joy egallaydi — barcha bosqichlar bir balandlikda */}
            <span className="h-4 text-[11px] leading-4 text-muted-foreground tabular">
              {at && (
                <Hint label={formatDateTime(at)}>
                  <span>{formatDate(at)}</span>
                </Hint>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
