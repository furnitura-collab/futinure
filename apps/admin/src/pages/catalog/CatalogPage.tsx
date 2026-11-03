import { useQuery } from '@tanstack/react-query';
import { Download, FolderTree, Percent, Plus, Search, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, apiDownload } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { flattenCategories, useBrands, useCategories } from '../../lib/catalog';
import { som } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import { UNIT } from '../../lib/labels';
import type { AdminProduct, Paginated } from '../../lib/types';
import { Badge, Button, cx, Empty, ErrorBox, Input, PageHeader, PageLoader, Pagination, Select, Toggle } from '../../components/ui';
import { BulkPriceDialog } from './BulkPriceDialog';
import { ImportDialog } from './ImportDialog';

export function CatalogPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [active, setActive] = useState<'' | 'true' | 'false'>('');
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<'import' | 'bulk' | null>(null);
  const query = useDebounced(q.trim());
  const categories = useCategories();
  const brands = useBrands();

  const filters = {
    q: query.length >= 1 ? query : undefined,
    categoryId: categoryId || undefined,
    brandId: brandId || undefined,
    isActive: active || undefined,
    lowStock: lowStock || undefined,
  };
  const { data, isPending, error } = useQuery({
    queryKey: ['products', filters, page],
    queryFn: () => api<Paginated<AdminProduct>>('/admin/products', { query: { ...filters, page, limit: 25 } }),
    placeholderData: (prev) => prev,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <div>
      <PageHeader title="Katalog">
        <Link to="/catalog/categories">
          <Button variant="ghost"><FolderTree className="size-4" /> Kategoriyalar</Button>
        </Link>
        <Button variant="secondary" onClick={() => void apiDownload('/admin/catalog/export.xlsx', `katalog-${new Date().toISOString().slice(0, 10)}.xlsx`)}>
          <Download className="size-4" /> Eksport
        </Button>
        <Button variant="secondary" onClick={() => setDialog('import')}><Upload className="size-4" /> Excel import</Button>
        {can('SUPER_ADMIN') && (
          <Button variant="secondary" onClick={() => setDialog('bulk')}><Percent className="size-4" /> Ommaviy narx</Button>
        )}
        <Button onClick={() => navigate('/catalog/new')}><Plus className="size-4" /> Mahsulot</Button>
      </PageHeader>

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-stone-400" />
            <Input className="w-72 pl-9" placeholder="Nom, kod yoki SKU" value={q} onChange={(e) => reset(setQ)(e.target.value)} />
          </div>
          <Select className="w-56" value={categoryId} onChange={(e) => reset(setCategoryId)(e.target.value)}>
            <option value="">Barcha kategoriyalar</option>
            {flattenCategories(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
          <Select className="w-44" value={brandId} onChange={(e) => reset(setBrandId)(e.target.value)}>
            <option value="">Barcha brendlar</option>
            {brands.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select className="w-36" value={active} onChange={(e) => reset(setActive)(e.target.value as typeof active)}>
            <option value="">Hammasi</option>
            <option value="true">Sotuvda</option>
            <option value="false">Nofaol</option>
          </Select>
          <Toggle checked={lowStock} onChange={reset(setLowStock)} label="Kam qolganlar" />
        </div>

        {isPending ? (
          <PageLoader />
        ) : error ? (
          <ErrorBox error={error} />
        ) : data.items.length === 0 ? (
          <Empty>Mahsulot topilmadi</Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs text-stone-500 uppercase">
                <tr>
                  <th className="w-14 px-4 py-3" />
                  <th className="px-4 py-3">Mahsulot</th>
                  <th className="px-4 py-3">Kategoriya</th>
                  <th className="px-4 py-3">Variantlar</th>
                  <th className="px-4 py-3 text-right">Narx</th>
                  <th className="px-4 py-3 text-right">Mavjud</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.items.map((p) => {
                  const prices = p.variants.map((v) => v.basePrice);
                  const min = Math.min(...prices);
                  const max = Math.max(...prices);
                  const low = p.variants.filter((v) => v.isActive && (v.stockLevel === 'LOW' || v.stockLevel === 'OUT_OF_STOCK')).length;
                  const available = p.variants.reduce((s, v) => s + Number(v.availableQty), 0);
                  return (
                    <tr key={p.id} className="cursor-pointer hover:bg-stone-50" onClick={() => navigate(`/catalog/${p.id}`)}>
                      <td className="px-4 py-2">
                        {p.images[0] ? (
                          <img src={p.images[0].url} alt="" className="size-10 rounded-md object-cover ring-1 ring-stone-200" />
                        ) : (
                          <div className="size-10 rounded-md bg-stone-100" />
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-medium">{p.nameUz}</p>
                        <p className="text-xs text-stone-500">{[p.code, p.brand?.name].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="px-4 py-2 text-stone-600">{p.category.nameUz}</td>
                      <td className="px-4 py-2 text-stone-600">{p.variants.length}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {p.variants.length ? (min === max ? som(min) : `${som(min)} – ${som(max)}`) : '—'}
                      </td>
                      <td className={cx('px-4 py-2 text-right whitespace-nowrap', low && 'text-amber-700')}>
                        {available} {UNIT[p.unit]}
                        {low > 0 && <p className="text-xs">{low} ta variant kam</p>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {!p.isActive && <Badge tone="bg-stone-100 text-stone-600 ring-stone-200">Nofaol</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={page} total={data.total} limit={data.limit} onPage={setPage} />}
      </div>

      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
      {dialog === 'bulk' && <BulkPriceDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
