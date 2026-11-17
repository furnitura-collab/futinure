import { useDroppable } from '@dnd-kit/core';
import type { Role } from '@mebel/shared';
import { StatusBadge } from '@/components/StatusBadge';
import { useI18n } from '@/i18n';
import type { KanbanColumn } from '@/lib/types';
import { cn } from '@/lib/utils';
import { BoardCard } from './BoardCard';
import { isMovable } from './rules';

/** `target`: sudrash paytida — shu ustunga tashlash mumkinmi (sudrash yo'q bo'lsa undefined) */
export function BoardColumn({ column: col, role, target, busyId }: { column: KanbanColumn; role?: Role; target?: boolean; busyId: string | null }) {
  const { t, label } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: col.status, disabled: target === false });
  return (
    <section
      ref={setNodeRef}
      aria-label={label('orderStatus', col.status)}
      className={cn(
        'surface flex max-h-[calc(100dvh-12rem)] min-h-48 min-w-[13.5rem] flex-1 basis-0 snap-start flex-col rounded-xl border transition-[opacity,box-shadow,background-color] duration-150',
        target === false && 'opacity-45',
        target && 'ring-1 ring-primary/30',
        target && isOver && 'bg-primary/8 ring-2 ring-primary/60',
      )}
    >
      <header className="flex items-center justify-between px-3 py-2">
        <StatusBadge kind="orderStatus" value={col.status} />
        <span className="text-xs font-medium text-muted-foreground tabular">{col.total}</span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {col.items.map((o) => (
          <BoardCard key={o.id} order={o} movable={isMovable(o, role)} busy={busyId === o.id} />
        ))}
        {col.items.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{t('orders.columnEmpty')}</p>}
        {col.total > col.items.length && (
          <p className="py-2 text-center text-xs text-muted-foreground">{t('orders.more', { n: col.total - col.items.length })}</p>
        )}
      </div>
    </section>
  );
}
