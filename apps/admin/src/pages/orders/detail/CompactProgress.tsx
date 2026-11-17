import { formatDate } from '@mebel/shared';
import { useI18n } from '@/i18n';
import type { OrderDetail } from '@/lib/types';
import { cn } from '@/lib/utils';
import { orderFlow, reachedAt } from './progress';

/** Telefonda: segmentli chiziq, joriy bosqich va sanasi, keyingi bosqich — to'liq stepper sig'maydi */
export function CompactProgress({ order, className }: { order: OrderDetail; className?: string }) {
  const { t, label } = useI18n();
  const { flow, current } = orderFlow(order);
  const next = flow[current + 1];
  const at = reachedAt(order, order.status);
  return (
    <div aria-label={t('order.progress')} className={cn('min-w-0 flex-1 space-y-2', className)}>
      <div className="flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={flow.length} aria-valuenow={current + 1}>
        {flow.map((s, i) => (
          <span key={s} className={cn('h-1.5 flex-1 rounded-full', i <= current ? 'bg-primary' : 'bg-muted')} />
        ))}
      </div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <p className="min-w-0 truncate">
          <span className="font-semibold">{label('orderStatus', order.status)}</span>
          {at && <span className="text-xs text-muted-foreground"> · {formatDate(at)}</span>}
        </p>
        {next && <p className="shrink-0 text-xs text-muted-foreground">→ {label('orderStatus', next)}</p>}
      </div>
    </div>
  );
}
