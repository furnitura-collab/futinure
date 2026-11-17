import { useState, type FormEvent } from 'react';
import { IconButton } from '@/components/IconButton';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { Plus, Trash } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBrands, usePriceGroups } from '@/lib/catalog';
import { useApiMutation } from '@/lib/mutation';
import { CategoryTree } from './CategoryTree';

export function CategoriesPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  return (
    <div>
      <PageHeader back={{ to: '/catalog', label: t('catalog.title') }} title={t('categories.title')} description={t('categories.subtitle')} />
      <div className="grid gap-4 xl:grid-cols-3">
        <CategoryTree />
        <div className="min-w-0 space-y-4">
          <BrandsCard />
          <PriceGroupsCard editable={can('SUPER_ADMIN')} />
        </div>
      </div>
    </div>
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
      <IconButton type="submit" icon={Plus} size="icon" variant="default" label={t('common.add')} disabled={!name.trim() || loading} />
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
            <IconButton
              icon={Trash}
              variant="ghost-destructive"
              disabled={b._count.products > 0}
              label={t('common.delete')}
              onClick={() => remove.mutate(b.id)}
            />
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
