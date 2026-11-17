import { DndContext, DragOverlay, type Announcements, type DragEndEvent, type DragStartEvent, type UniqueIdentifier } from '@dnd-kit/core';
import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useDndSensors } from '@/lib/dnd';
import type { KanbanColumn, OrderCard } from '@/lib/types';
import { cn } from '@/lib/utils';
import { BoardCardOverlay } from './BoardCard';
import { BoardColumn } from './BoardColumn';
import { canMove, isOrderStatus } from './rules';
import { useBoardDrop } from './useBoardDrop';
import { useEdgeFade } from './useEdgeFade';
import { TransitionDialog } from '../detail/TransitionDialog';

// Chetdagi soya: aylantirish mumkinligini bildiradi (mesh fon ustida gradient emas, mask)
const FADE = {
  both: '[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]',
  left: '[mask-image:linear-gradient(to_right,transparent,black_1.5rem)]',
  right: '[mask-image:linear-gradient(to_left,transparent,black_1.5rem)]',
};

/** Kanban: har status — ustun; kartani boshqa ustunga sudrash — status o'tishi */
export function OrdersBoard({ query }: { query: UseQueryResult<KanbanColumn[]> }) {
  const { t, label } = useI18n();
  const role = useAuth().me?.role;
  const sensors = useDndSensors();
  const fade = useEdgeFade<HTMLDivElement>(query.data);
  const { busyId, pending, drop, close } = useBoardDrop();
  const [active, setActive] = useState<OrderCard | null>(null);

  const findCard = (id: UniqueIdentifier) => query.data?.flatMap((c) => c.items).find((o) => o.id === id);
  const statusText = (id: UniqueIdentifier | undefined) => (typeof id === 'string' && isOrderStatus(id) ? label('orderStatus', id) : '');
  const number = (id: UniqueIdentifier) => findCard(id)?.number ?? '';
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => t('orders.drag.start', { number: number(a.id) }),
    onDragOver: ({ active: a, over }) => (over ? t('orders.drag.over', { number: number(a.id), status: statusText(over.id) }) : undefined),
    onDragEnd: ({ active: a, over }) => (over ? t('orders.drag.over', { number: number(a.id), status: statusText(over.id) }) : t('orders.drag.cancel')),
    onDragCancel: () => t('orders.drag.cancel'),
  };

  const onDragStart = ({ active: a }: DragStartEvent) => setActive(findCard(a.id) ?? null);
  const onDragEnd = ({ over }: DragEndEvent) => {
    const card = active;
    setActive(null);
    const to = over?.id;
    if (card && typeof to === 'string' && isOrderStatus(to) && canMove(card, to, role)) void drop(card, to);
  };

  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const fadeClass = fade.left && fade.right ? FADE.both : fade.left ? FADE.left : fade.right ? FADE.right : undefined;
  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t('orders.drag.instructions') } }}
    >
      <div
        ref={fade.ref}
        className={cn(
          '-mx-3 flex snap-x scroll-px-3 gap-3 overflow-x-auto px-3 pb-3 sm:-mx-5 sm:scroll-px-5 sm:px-5 lg:-mx-6 lg:scroll-px-6 lg:px-6',
          fadeClass,
        )}
      >
        {query.isPending
          ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-96 min-w-[13.5rem] flex-1 basis-0 rounded-xl" />)
          : query.data.map((col) => (
              <BoardColumn key={col.status} column={col} role={role} busyId={busyId} target={active ? canMove(active, col.status, role) : undefined} />
            ))}
      </div>
      <DragOverlay dropAnimation={null}>{active && <BoardCardOverlay order={active} />}</DragOverlay>
      {pending && <TransitionDialog {...pending} onClose={close} />}
    </DndContext>
  );
}
