import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { flattenCategories, slugify, useBrands, useCategories, usePriceGroups } from '../../lib/catalog';
import { useApiMutation } from '../../lib/mutation';
import type { Category } from '../../lib/types';
import { Badge, Button, Card, Dialog, Field, Input, PageHeader, PageLoader, Select, Toggle } from '../../components/ui';

export function CategoriesPage() {
  const { can } = useAuth();
  const categories = useCategories();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const remove = useApiMutation((id: string) => api(`/admin/categories/${id}`, { method: 'DELETE' }), {
    invalidate: [['categories']],
    success: 'O\'chirildi',
  });

  return (
    <div>
      <PageHeader
        title="Kategoriyalar, brendlar, narx guruhlari"
        back={
          <Link to="/catalog" className="rounded-md p-1.5 text-stone-500 hover:bg-stone-200">
            <ArrowLeft className="size-5" />
          </Link>
        }
      />
      <div className="grid gap-6 p-6 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Kategoriyalar"
          actions={<Button size="sm" onClick={() => setEditing('new')}><Plus className="size-4" /> Kategoriya</Button>}
        >
          {categories.isPending ? (
            <PageLoader />
          ) : (
            <ul className="divide-y divide-stone-100">
              {flattenCategories(categories.data ?? []).map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2" style={{ paddingLeft: c.depth * 24 }}>
                  <span className="flex-1 text-sm">
                    <span className="font-medium">{c.nameUz}</span>
                    <span className="ml-2 text-stone-400">{c.nameRu} · /{c.slug}</span>
                  </span>
                  {!c.isActive && <Badge tone="bg-stone-100 text-stone-600 ring-stone-200">Nofaol</Badge>}
                  <span className="text-xs text-stone-500">{c._count.products} mahsulot</span>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(c)}><Pencil className="size-4" /></Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={c._count.products > 0 || c._count.children > 0}
                    title={c._count.products || c._count.children ? 'Bo\'sh emas — nofaol qiling' : 'O\'chirish'}
                    onClick={() => remove.mutate(c.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <BrandsCard />
          <PriceGroupsCard editable={can('SUPER_ADMIN')} />
        </div>
      </div>
      {editing && <CategoryDialog category={editing === 'new' ? null : editing} all={categories.data ?? []} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CategoryDialog({ category, all, onClose }: { category: Category | null; all: Category[]; onClose: () => void }) {
  const [nameUz, setNameUz] = useState(category?.nameUz ?? '');
  const [nameRu, setNameRu] = useState(category?.nameRu ?? '');
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!!category);
  const [parentId, setParentId] = useState(category?.parentId ?? '');
  const [sortOrder, setSortOrder] = useState(category?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(category?.isActive ?? true);

  const save = useApiMutation(
    () => {
      const body = { nameUz: nameUz.trim(), nameRu: nameRu.trim(), slug, parentId: parentId || null, sortOrder, isActive };
      return category ? api(`/admin/categories/${category.id}`, { method: 'PATCH', body }) : api('/admin/categories', { body });
    },
    { invalidate: [['categories']], success: 'Saqlandi', onSuccess: onClose },
  );
  // O'zini va avlodlarini ota sifatida tanlab bo'lmaydi (backend ham tekshiradi)
  const options = flattenCategories(all).filter((c) => c.id !== category?.id);

  return (
    <Dialog
      open
      onClose={onClose}
      title={category ? 'Kategoriyani tahrirlash' : 'Yangi kategoriya'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Bekor</Button>
          <Button loading={save.isPending} disabled={!nameUz.trim() || !nameRu.trim() || !slug} onClick={() => save.mutate(undefined)}>Saqlash</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nomi (o'zbekcha)">
          {(id) => (
            <Input
              id={id}
              autoFocus
              value={nameUz}
              onChange={(e) => {
                setNameUz(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          )}
        </Field>
        <Field label="Nomi (ruscha)">{(id) => <Input id={id} value={nameRu} onChange={(e) => setNameRu(e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Slug (havola)">
            {(id) => (
              <Input
                id={id}
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
              />
            )}
          </Field>
          <Field label="Tartib">{(id) => <Input id={id} type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />}</Field>
        </div>
        <Field label="Ota kategoriya">
          {(id) => (
            <Select id={id} value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— yuqori daraja —</option>
              {options.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          )}
        </Field>
        <Toggle checked={isActive} onChange={setIsActive} label="Faol (mijozlarga ko'rinadi)" />
      </div>
    </Dialog>
  );
}

function BrandsCard() {
  const brands = useBrands();
  const [name, setName] = useState('');
  const add = useApiMutation(() => api('/admin/brands', { body: { name: name.trim() } }), {
    invalidate: [['brands']],
    onSuccess: () => setName(''),
  });
  const remove = useApiMutation((id: string) => api(`/admin/brands/${id}`, { method: 'DELETE' }), { invalidate: [['brands']] });
  return (
    <Card title="Brendlar">
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) add.mutate(undefined);
        }}
      >
        <Input placeholder="Yangi brend" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" loading={add.isPending} disabled={!name.trim()}><Plus className="size-4" /></Button>
      </form>
      <ul className="divide-y divide-stone-100 text-sm">
        {brands.data?.map((b) => (
          <li key={b.id} className="flex items-center justify-between py-1.5">
            <span>{b.name} <span className="text-xs text-stone-400">{b._count.products}</span></span>
            <Button size="sm" variant="ghost" disabled={b._count.products > 0} onClick={() => remove.mutate(b.id)}>
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PriceGroupsCard({ editable }: { editable: boolean }) {
  const groups = usePriceGroups();
  const [name, setName] = useState('');
  const add = useApiMutation(() => api('/admin/price-groups', { body: { name: name.trim() } }), {
    invalidate: [['price-groups']],
    onSuccess: () => setName(''),
  });
  return (
    <Card title="Narx guruhlari">
      {editable && (
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) add.mutate(undefined);
          }}
        >
          <Input placeholder="Masalan: Diler" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" loading={add.isPending} disabled={!name.trim()}><Plus className="size-4" /></Button>
        </form>
      )}
      <ul className="divide-y divide-stone-100 text-sm">
        {groups.data?.map((g) => (
          <li key={g.id} className="flex justify-between py-1.5">
            <span>{g.name}</span>
            <span className="text-xs text-stone-500">{g._count.customers} mijoz · {g._count.prices} narx</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-stone-500">Mijozni guruhga "Mijozlar" sahifasida biriktiriladi; narxlar — variant oynasida.</p>
    </Card>
  );
}
