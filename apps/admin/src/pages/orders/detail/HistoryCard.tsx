import { formatDateTime } from '@mebel/shared';
import { SectionCard } from '@/components/SectionCard';
import { StatusBadge } from '@/components/StatusBadge';
import { useI18n } from '@/i18n';
import type { OrderDetail } from '@/lib/types';

/** Kim, qachon, qaysi holatga o'tkazdi (izoh bilan); yangisi tepada */
export function HistoryCard({ order }: { order: OrderDetail }) {
  const { t, label } = useI18n();
  return (
    <SectionCard title={t('order.history')}>
      <ol className="relative space-y-3 border-l pl-4 text-sm">
        {[...order.statusHistory].reverse().map((h) => (
          <li key={h.id} className="relative">
            <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-border ring-4 ring-card" />
            <StatusBadge kind="orderStatus" value={h.toStatus} />
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDateTime(h.createdAt)} · {h.actor ? `${h.actor.fullName ?? ''} (${label('role', h.actor.role)})` : t('order.system')}
            </p>
            {h.comment && <p className="mt-0.5">{h.comment}</p>}
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
