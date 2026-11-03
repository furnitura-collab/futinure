import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ImagePlus, PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PRODUCT_KINDS, UNITS, type Unit } from '@mebel/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { attrsText, flattenCategories, useBrands, useCategories } from '../../lib/catalog';
import { som } from '../../lib/format';
import { UNIT } from '../../lib/labels';
import { useApiMutation } from '../../lib/mutation';
import type { AdminProduct, AdminVariant } from '../../lib/types';
import { Badge, Button, Card, cx, Dialog, ErrorBox, Field, Input, PageHeader, PageLoader, Select, Textarea, Toggle } from '../../components/ui';
import { StockDialog } from '../stock/StockDialog';
import { VariantDialog } from './VariantDialog';

const KIND_LABEL: Record<(typeof PRODUCT_KINDS)[number], string> = {
  GOODS: 'Oddiy tovar',
  BOARD: 'Plita (raspilga yaroqli)',
  EDGE: 'Kromka',
};

const LEVEL: Record<AdminVariant['stockLevel'], { label: string; tone: string }> = {
  IN_STOCK: { label: 'Bor', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  LOW: { label: 'Kam', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  ON_ORDER: { label: 'Buyurtmaga', tone: 'bg-sky-50 text-sky-700 ring-sky-200' },
  OUT_OF_STOCK: { label: 'Yo\'q', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

interface Form {
  nameUz: string;
  nameRu: string;
  code: string;
  categoryId: string;
  brandId: string;
  unit: Unit;
  kind: (typeof PRODUCT_KINDS)[number];
  minQty: string;
  qtyStep: string;
  weightKg: string;
  volumeM3: string;
  boardLengthMm: string;
  boardWidthMm: string;
  thicknessMm: string;
  descriptionUz: string;
  descriptionRu: string;
  isActive: boolean;
}

function toForm(p?: AdminProduct): Form {
  return {
    nameUz: p?.nameUz ?? '',
    nameRu: p?.nameRu ?? '',
    code: p?.code ?? '',
    categoryId: p?.categoryId ?? '',
    brandId: p?.brandId ?? '',
    unit: p?.unit ?? 'PIECE',
    kind: p?.kind ?? 'GOODS',
    minQty: p?.minQty ?? '1',
    qtyStep: p?.qtyStep ?? '1',
    weightKg: p?.weightKg ?? '',
    volumeM3: p?.volumeM3 ?? '',
    boardLengthMm: p?.boardLengthMm?.toString() ?? '',
    boardWidthMm: p?.boardWidthMm?.toString() ?? '',
    thicknessMm: p?.thicknessMm ?? '',
    descriptionUz: p?.descriptionUz ?? '',
    descriptionRu: p?.descriptionRu ?? '',
    isActive: p?.isActive ?? true,
  };
}

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

function toPayload(f: Form) {
  return {
    nameUz: f.nameUz.trim(),
    nameRu: f.nameRu.trim(),
    code: f.code.trim() || null,
    categoryId: f.categoryId,
    brandId: f.brandId || null,
    unit: f.unit,
    kind: f.kind,
    minQty: f.minQty.replace(',', '.'),
    qtyStep: f.qtyStep.replace(',', '.'),
    weightKg: f.weightKg.trim() ? f.weightKg.replace(',', '.') : null,
    volumeM3: numOrNull(f.volumeM3),
    boardLengthMm: numOrNull(f.boardLengthMm),
    boardWidthMm: numOrNull(f.boardWidthMm),
    thicknessMm: numOrNull(f.thicknessMm),
    descriptionUz: f.descriptionUz.trim() || null,
    descriptionRu: f.descriptionRu.trim() || null,
    isActive: f.isActive,
  };
}

export function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const { data, isPending, error } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api<AdminProduct>(`/admin/products/${id}`),
    enabled: !isNew,
  });
  if (!isNew && isPending) return <PageLoader />;
  if (error) return <div className="p-6"><ErrorBox error={error} /></div>;
  // key — boshqa mahsulotga o'tganda forma qayta boshlanadi
  return <ProductEditor key={data?.id ?? 'new'} product={isNew ? undefined : data} />;
}

function ProductEditor({ product }: { product?: AdminProduct }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const categories = useCategories();
  const brands = useBrands();
  const [form, setForm] = useState<Form>(() => toForm(product));
  const [variant, setVariant] = useState<AdminVariant | 'new' | null>(null);
  const [stockFor, setStockFor] = useState<AdminVariant | null>(null);
  const [deleting, setDeleting] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useApiMutation(
    () =>
      product
        ? api<AdminProduct>(`/admin/products/${product.id}`, { method: 'PATCH', body: toPayload(form) })
        : api<AdminProduct>('/admin/products', { body: toPayload(form) }),
    {
      invalidate: [['products'], ['product', product?.id]],
      success: product ? 'Saqlandi' : 'Mahsulot yaratildi — endi variant qo\'shing',
      onSuccess: (p) => {
        if (!product) navigate(`/catalog/${p.id}`, { replace: true });
      },
    },
  );
  const remove = useApiMutation(() => api(`/admin/products/${product!.id}`, { method: 'DELETE' }), {
    invalidate: [['products']],
    success: 'O\'chirildi',
    onSuccess: () => navigate('/catalog'),
  });

  const valid = form.nameUz.trim() && form.nameRu.trim() && form.categoryId && (form.kind !== 'BOARD' || (form.boardLengthMm && form.boardWidthMm));

  return (
    <div>
      <PageHeader
        title={product ? product.nameUz : 'Yangi mahsulot'}
        back={
          <Link to="/catalog" className="rounded-md p-1.5 text-stone-500 hover:bg-stone-200">
            <ArrowLeft className="size-5" />
          </Link>
        }
      >
        {product && can('SUPER_ADMIN') && (
          <Button variant="ghost" className="text-rose-700" onClick={() => setDeleting(true)}>
            <Trash2 className="size-4" /> O'chirish
          </Button>
        )}
        <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate(undefined)}>
          Saqlash
        </Button>
      </PageHeader>

      <div className="grid gap-6 p-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Asosiy ma'lumot">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nomi (o'zbekcha)">{(id) => <Input id={id} value={form.nameUz} onChange={(e) => set('nameUz', e.target.value)} />}</Field>
              <Field label="Nomi (ruscha)">{(id) => <Input id={id} value={form.nameRu} onChange={(e) => set('nameRu', e.target.value)} />}</Field>
              <Field label="Kategoriya">
                {(id) => (
                  <Select id={id} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                    <option value="">— tanlang —</option>
                    {flattenCategories(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Brend">
                {(id) => (
                  <Select id={id} value={form.brandId} onChange={(e) => set('brandId', e.target.value)}>
                    <option value="">—</option>
                    {brands.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Mahsulot kodi" hint="Excel importda variantlarni guruhlash uchun">
                {(id) => <Input id={id} value={form.code} onChange={(e) => set('code', e.target.value)} />}
              </Field>
              <Field label="Turi">
                {(id) => (
                  <Select id={id} value={form.kind} onChange={(e) => set('kind', e.target.value as Form['kind'])}>
                    {PRODUCT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </Select>
                )}
              </Field>
            </div>
          </Card>

          <Card title="Sotuv qoidalari">
            <div className="grid grid-cols-4 gap-4">
              <Field label="O'lchov birligi">
                {(id) => (
                  <Select id={id} value={form.unit} onChange={(e) => set('unit', e.target.value as Unit)}>
                    {UNITS.map((u) => <option key={u} value={u}>{UNIT[u]}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Minimal miqdor">{(id) => <Input id={id} value={form.minQty} onChange={(e) => set('minQty', e.target.value)} />}</Field>
              <Field label="Qadam" hint="100 — faqat 100, 200…">{(id) => <Input id={id} value={form.qtyStep} onChange={(e) => set('qtyStep', e.target.value)} />}</Field>
              <Field label="Og'irlik, kg">{(id) => <Input id={id} value={form.weightKg} onChange={(e) => set('weightKg', e.target.value)} />}</Field>
              <Field label="Hajm, m³">{(id) => <Input id={id} value={form.volumeM3} onChange={(e) => set('volumeM3', e.target.value)} />}</Field>
              {form.kind === 'BOARD' && (
                <>
                  <Field label="Uzunligi, mm">{(id) => <Input id={id} value={form.boardLengthMm} onChange={(e) => set('boardLengthMm', e.target.value)} />}</Field>
                  <Field label="Eni, mm">{(id) => <Input id={id} value={form.boardWidthMm} onChange={(e) => set('boardWidthMm', e.target.value)} />}</Field>
                </>
              )}
              <Field label="Qalinligi, mm">{(id) => <Input id={id} value={form.thicknessMm} onChange={(e) => set('thicknessMm', e.target.value)} />}</Field>
            </div>
            <div className="mt-4">
              <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Sotuvda (mijozlarga ko'rinadi)" />
            </div>
          </Card>

          {product && (
            <Card
              title={`Variantlar (${product.variants.length})`}
              actions={
                <Button size="sm" variant="secondary" onClick={() => setVariant('new')}>
                  <Plus className="size-4" /> Variant
                </Button>
              }
            >
              {product.variants.length === 0 ? (
                <p className="text-sm text-stone-500">Variant yo'q — mahsulot mijozlarga ko'rinmaydi. Kamida bitta variant (SKU va narx) qo'shing.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-stone-500">
                    <tr>
                      <th className="pb-2">SKU</th>
                      <th className="pb-2">Xususiyatlar</th>
                      <th className="pb-2 text-right">Narx</th>
                      <th className="pb-2 text-right">Qoldiq</th>
                      <th className="pb-2" />
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {product.variants.map((v) => (
                      <tr key={v.id} className={cx(!v.isActive && 'opacity-50')}>
                        <td className="py-2 font-mono text-xs">{v.sku}</td>
                        <td className="py-2">{attrsText(v.attributes) || '—'}</td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {som(v.basePrice)}
                          {(v.priceTiers.length > 0 || v.groupPrices.length > 0) && (
                            <p className="text-xs text-stone-500">
                              {[v.priceTiers.length && `${v.priceTiers.length} pog'ona`, v.groupPrices.length && `${v.groupPrices.length} guruh`].filter(Boolean).join(', ')}
                            </p>
                          )}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {v.availableQty} {UNIT[product.unit]}
                          {Number(v.reservedQty) > 0 && <p className="text-xs text-stone-500">band {v.reservedQty}</p>}
                        </td>
                        <td className="py-2 pl-3"><Badge tone={LEVEL[v.stockLevel].tone}>{LEVEL[v.stockLevel].label}</Badge></td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" title="Kirim / inventarizatsiya" onClick={() => setStockFor(v)}>
                            <PackagePlus className="size-4" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Tahrirlash" onClick={() => setVariant(v)}>
                            <Pencil className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {product && <ImagesCard product={product} />}
          <Card title="Tavsif">
            <div className="space-y-4">
              <Field label="O'zbekcha">{(id) => <Textarea id={id} rows={4} value={form.descriptionUz} onChange={(e) => set('descriptionUz', e.target.value)} />}</Field>
              <Field label="Ruscha">{(id) => <Textarea id={id} rows={4} value={form.descriptionRu} onChange={(e) => set('descriptionRu', e.target.value)} />}</Field>
            </div>
          </Card>
        </div>
      </div>

      {product && variant && (
        <VariantDialog product={product} variant={variant === 'new' ? null : variant} onClose={() => setVariant(null)} />
      )}
      {product && stockFor && <StockDialog variant={stockFor} unit={product.unit} title={`${product.nameUz} · ${stockFor.sku}`} onClose={() => setStockFor(null)} />}
      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Mahsulotni o'chirish"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(false)}>Bekor</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(undefined)}>O'chirish</Button>
          </>
        }
      >
        <p className="text-sm">
          Buyurtmalarda ishlatilgan mahsulot o'chirilmaydi — uni "Sotuvda" belgisini o'chirib nofaol qiling. Ishlatilmagan bo'lsa butunlay o'chiriladi.
        </p>
      </Dialog>
    </div>
  );
}

function ImagesCard({ product }: { product: AdminProduct }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useApiMutation(
    async (files: File[]) => {
      for (const file of files) {
        const form = new FormData();
        form.set('file', file);
        const { url } = await api<{ url: string }>('/admin/uploads/images', { form });
        await api(`/admin/products/${product.id}/images`, { body: { url, sortOrder: product.images.length } });
      }
    },
    { invalidate: [['product', product.id], ['products']], success: 'Rasm qo\'shildi' },
  );
  const remove = useApiMutation((imageId: string) => api(`/admin/products/${product.id}/images/${imageId}`, { method: 'DELETE' }), {
    invalidate: [['product', product.id], ['products']],
  });
  const makeMain = useApiMutation(
    (imageId: string) =>
      api(`/admin/products/${product.id}/images/order`, {
        method: 'PUT',
        body: { ids: [imageId, ...product.images.filter((i) => i.id !== imageId).map((i) => i.id)] },
      }),
    { invalidate: [['product', product.id], ['products']] },
  );

  return (
    <Card
      title="Rasmlar"
      actions={
        <Button size="sm" variant="secondary" loading={upload.isPending} onClick={() => fileRef.current?.click()}>
          <ImagePlus className="size-4" /> Yuklash
        </Button>
      }
    >
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) upload.mutate(files);
          e.target.value = '';
        }}
      />
      {product.images.length === 0 ? (
        <p className="text-sm text-stone-500">Rasm yo'q. JPG/PNG/WEBP, 5 MB gacha.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {product.images.map((img, i) => (
            <div key={img.id} className="group relative">
              <img src={img.url} alt="" className={cx('aspect-square w-full rounded-lg object-cover ring-1', i === 0 ? 'ring-2 ring-brand-500' : 'ring-stone-200')} />
              <div className="absolute inset-x-1 bottom-1 hidden justify-between group-hover:flex">
                {i > 0 ? (
                  <button className="rounded bg-white/90 px-1.5 text-xs" onClick={() => makeMain.mutate(img.id)}>Asosiy</button>
                ) : <span />}
                <button className="rounded bg-white/90 p-1 text-rose-600" onClick={() => remove.mutate(img.id)} title="O'chirish">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
