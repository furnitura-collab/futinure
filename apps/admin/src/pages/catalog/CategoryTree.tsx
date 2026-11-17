import { useState, type CSSProperties } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SortableList, type DragHandle } from '@/components/dnd/SortableList';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { SectionCard } from '@/components/SectionCard';
import { FolderTree, Pencil, Plus, Trash } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { categoryChildren, useCategories, useCategoryReorder } from '@/lib/catalog';
import { useApiMutation } from '@/lib/mutation';
import type { Category } from '@/lib/types';
import { CategoryDialog } from './CategoryDialog';

type Editing = { category: Category | null; parentId: string | null };

interface RowActions {
  onEdit: (c: Category) => void;
  onAddChild: (c: Category) => void;
  onDelete: (c: Category) => void;
}

function CategoryRow({ c, depth, handle, actions }: { c: Category; depth: number; handle: DragHandle; actions: RowActions }) {
  const { t } = useI18n();
  const busy = c._count.products > 0 || c._count.children > 0;
  return (
    // Chuqurlik chekinishi telefonda torroq (16px), kattaroq ekranda 24px
    <div
      className="group flex items-center gap-2 border-b py-1.5 pr-2 pl-[calc(8px_+_var(--depth)_*_16px)] transition-colors hover:bg-muted/40 pointer-coarse:py-2 sm:pl-[calc(8px_+_var(--depth)_*_24px)]"
      style={{ '--depth': depth } as CSSProperties}
    >
      {handle}
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">{c.nameUz}</span>
        <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">/{c.slug}</span>
      </span>
      {!c.isActive && <Badge>{t('common.inactive')}</Badge>}
      <span className="hidden text-xs text-muted-foreground tabular sm:inline">{t('categories.productsCount', { n: c._count.products })}</span>
      {/* Hover faqat sichqonchada bor — sensorli ekranda amallar doim ko'rinadi */}
      <div className="flex shrink-0 gap-0.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
        <IconButton icon={Plus} label={t('categories.addChild')} onClick={() => actions.onAddChild(c)} />
        <IconButton icon={Pencil} label={t('common.edit')} onClick={() => actions.onEdit(c)} />
        <IconButton
          icon={Trash}
          variant="ghost-destructive"
          disabled={busy}
          label={busy ? t('categories.notEmpty') : t('common.delete')}
          onClick={() => actions.onDelete(c)}
        />
      </div>
    </div>
  );
}

/** Bir ota ichidagi bolalar — alohida sudraladigan ro'yxat; sudrash boshqa otaga o'tkazmaydi */
function Branch({
  parentId,
  depth,
  tree,
  actions,
  onReorder,
}: {
  parentId: string | null;
  depth: number;
  tree: Map<string | null, Category[]>;
  actions: RowActions;
  onReorder: (ids: string[]) => void;
}) {
  const items = tree.get(parentId) ?? [];
  if (!items.length) return null;
  return (
    <SortableList
      items={items}
      getId={(c) => c.id}
      onReorder={onReorder}
      renderItem={(c, handle) => (
        <>
          <CategoryRow c={c} depth={depth} handle={handle} actions={actions} />
          <Branch parentId={c.id} depth={depth + 1} tree={tree} actions={actions} onReorder={onReorder} />
        </>
      )}
    />
  );
}

export function CategoryTree() {
  const { t } = useI18n();
  const categories = useCategories();
  const reorder = useCategoryReorder();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const remove = useApiMutation((id: string) => api(`/admin/categories/${id}`, { method: 'DELETE' }), {
    invalidate: [['categories']],
    success: t('common.deleted'),
    onSuccess: () => setDeleting(null),
  });
  const all = categories.data ?? [];
  const actions: RowActions = {
    onEdit: (c) => setEditing({ category: c, parentId: c.parentId }),
    onAddChild: (c) => setEditing({ category: null, parentId: c.id }),
    onDelete: setDeleting,
  };

  return (
    <SectionCard
      className="xl:col-span-2"
      title={t('catalog.categories')}
      description={
        all.length > 1 ? (
          <>
            <span className="pointer-coarse:hidden">{t('categories.dragHint')}</span>
            <span className="hidden pointer-coarse:inline">{t('categories.dragHintTouch')}</span>
          </>
        ) : undefined
      }
      flush
      actions={
        <Button size="sm" onClick={() => setEditing({ category: null, parentId: null })}>
          {t('categories.add')}
        </Button>
      }
    >
      {categories.isPending ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState icon={FolderTree} title={t('categories.empty')} />
      ) : (
        <div className="-mb-px">
          <Branch parentId={null} depth={0} tree={categoryChildren(all)} actions={actions} onReorder={(ids) => reorder.mutate(ids)} />
        </div>
      )}
      {editing && (
        <CategoryDialog category={editing.category} defaultParentId={editing.parentId} all={all} onClose={() => setEditing(null)} />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('common.delete')}
        description={deleting?.nameUz}
        confirmLabel={t('common.delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </SectionCard>
  );
}
