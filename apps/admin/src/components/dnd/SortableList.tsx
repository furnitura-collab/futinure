import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';
import { GripVertical } from '@/components/icons';
import { useI18n } from '@/i18n';
import { useDndSensors } from '@/lib/dnd';
import { cn } from '@/lib/utils';

/** Tutqich: sudrash faqat shu yerdan — qatordagi tugma va havolalar odatdagidek ishlaydi */
export type DragHandle = ReactNode;

function SortableItem({ id, disabled, children }: { id: string; disabled?: boolean; children: (handle: DragHandle) => ReactNode }) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const handle = disabled ? null : (
    <button
      type="button"
      ref={setActivatorNodeRef}
      aria-label={t('common.dragHandle')}
      title={t('common.dragHandle')}
      className="flex size-7 shrink-0 cursor-grab touch-none pointer-coarse:size-10 items-center justify-center rounded-md text-muted-foreground/60 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-90 shadow-lg shadow-primary/15')}
    >
      {children(handle)}
    </div>
  );
}

/** Sudrab tartiblanadigan ro'yxat yoki to'r; tashlanganda yangi id tartibi qaytadi */
export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  layout = 'list',
  disabled,
  className,
}: {
  items: T[];
  getId: (item: T) => string;
  onReorder: (ids: string[]) => void;
  renderItem: (item: T, handle: DragHandle) => ReactNode;
  layout?: 'list' | 'grid';
  disabled?: boolean;
  className?: string;
}) {
  const sensors = useDndSensors();
  const ids = items.map(getId);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item) => (
            <SortableItem key={getId(item)} id={getId(item)} disabled={disabled}>
              {(handle) => renderItem(item, handle)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
