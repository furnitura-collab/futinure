import { FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { flattenCategories, useBrands, useCategories, usePriceGroups } from '@/lib/catalog';
import { useApiMutation } from '@/lib/mutation';
import type { Category } from '@/lib/types';
import { CategoryDialog } from './CategoryDialog';

export function CategoriesPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  return (
    <div>
      <PageHeader back={{ to: '/catalog', label: t('catalog.title') }} title={t('categories.title')} description={t('categories.subtitle')} />
      <div className="grid gap-6 xl:grid-cols-3">
        <CategoriesCard />
        <div className="min-w-0 space-y-6">
          <BrandsCard />
          <PriceGroupsCard editable={can('SUPER_ADMIN')} />
        </div>
      </div>
    </div>
  );
}

function CategoriesCard() {
  const { t } = useI18n();
  const categories = useCategories();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const remove = useApiMutation((id: string) => api(`/admin/categories/${id}`, { method: 'DELETE' }), {
    invalidate: [['categories']],
    success: t('common.deleted'),
    onSuccess: () => setDeleting(null),
  });
  const rows = flattenCategories(categories.data ?? []);

  return (
    <SectionCard
      className="xl:col-span-2"
      title={t('catalog.categories')}
      flush
      actions={
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus /> {t('categories.add')}
        </Button>
      }
    >
      {categories.isPending ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={FolderTree} title={t('categories.empty')} />
      ) : (
        <ul className="divide-y">
          {rows.map((c) => {
            const busy = c._count.products > 0 || c._count.children > 0;
            return (
              <li key={c.id} className="flex items-center gap-3 py-2 pr-3 transition-colors hover:bg-muted/40" style={{ paddingLeft: 20 + c.depth * 24 }}>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{c.nameUz}</span>
                  <span className="ml-2 hidden text-muted-foreground sm:inline">
                    {c.nameRu} · /{c.slug}
                  </span>
                </span>
                {!c.isActive && <Badge>{t('common.inactive')}</Badge>}
                <span className="hidden text-xs text-muted-foreground sm:inline">{t('categories.productsCount', { n: c._count.products })}</span>
                <Button size="icon-sm" variant="ghost" aria-label={t('common.edit')} title={t('common.edit')} onClick={() => setEditing(c)}>
                  <Pencil />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost-destructive"
                  disabled={busy}
                  aria-label={t('common.delete')}
                  title={busy ? t('categories.notEmpty') : t('common.delete')}
                  onClick={() => setDeleting(c)}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <CategoryDialog category={editing === 'new' ? null : editing} all={categories.data ?? []} onClose={() => setEditing(null)} />}
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

function AddForm({ placeholder, onAdd, loading }: { placeholder: string; onAdd: (name: string, reset: () => void) => void; loading: boolean }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onAdd(name.trim(), () => setName(''));
  };
  return (
    <form className="mb-3 flex gap-2" onSubmit={submit}>
      <Input aria-label={placeholder} placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" size="icon" loading={loading} disabled={!name.trim()} aria-label={t('common.add')}>
        {!loading && <Plus />}
      </Button>
    </form>
  );
}

function BrandsCard() {
  const { t } = useI18n();
  const brands = useBrands();
  const add = useApiMutation((name: string) => api('/admin/brands', { body: { name } }), { invalidate: [['brands']] });
  const remove = useApiMutation((id: string) => api(`/admin/brands/${id}`, { method: 'DELETE' }), { invalidate: [['brands']] });
  return (
    <SectionCard title={t('categories.brands')}>
      <AddForm placeholder={t('categories.newBrand')} loading={add.isPending} onAdd={(name, reset) => add.mutate(name, { onSuccess: reset })} />
      <ul className="divide-y text-sm">
        {brands.data?.map((b) => (
          <li key={b.id} className="flex items-center justify-between py-1.5">
            <span>
              {b.name} <span className="text-xs text-muted-foreground tabular">{b._count.products}</span>
            </span>
            <Button
              size="icon-sm"
              variant="ghost-destructive"
              disabled={b._count.products > 0}
              aria-label={t('common.delete')}
              onClick={() => remove.mutate(b.id)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function PriceGroupsCard({ editable }: { editable: boolean }) {
  const { t } = useI18n();
  const groups = usePriceGroups();
  const add = useApiMutation((name: string) => api('/admin/price-groups', { body: { name } }), {
    invalidate: [['price-groups']],
  });
  return (
    <SectionCard title={t('categories.priceGroups')}>
      {editable && (
        <AddForm placeholder={t('categories.groupPlaceholder')} loading={add.isPending} onAdd={(name, reset) => add.mutate(name, { onSuccess: reset })} />
      )}
      <ul className="divide-y text-sm">
        {groups.data?.map((g) => (
          <li key={g.id} className="flex justify-between gap-3 py-1.5">
            <span>{g.name}</span>
            <span className="text-xs text-muted-foreground">{t('categories.groupStats', { customers: g._count.customers, prices: g._count.prices })}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">{t('categories.groupsHint')}</p>
    </SectionCard>
  );
}
