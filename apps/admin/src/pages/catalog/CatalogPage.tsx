import { useQuery } from '@tanstack/react-query';
import { Download, FolderTree, ImageOff, PackageSearch, Percent, Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { DataTable, type Column } from '@/components/DataTable';
import { OptionSelect } from '@/components/OptionSelect';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { SwitchField } from '@/components/SwitchField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { api, apiDownload, fileUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { flattenCategories, useBrands, useCategories } from '@/lib/catalog';
import { useDebounced } from '@/lib/hooks';
import type { AdminProduct, Paginated } from '@/lib/types';
import { cn } from '@/lib/utils';
import { BulkPriceDialog } from './BulkPriceDialog';
import { ImportDialog } from './ImportDialog';

type ActiveFilter = '' | 'true' | 'false';
const isActiveFilter = (v: string): v is ActiveFilter => v === '' || v === 'true' || v === 'false';

function priceRange(p: AdminProduct, money: (n: number) => string) {
  if (!p.variants.length) return '—';
  const prices = p.variants.map((v) => v.basePrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? money(min) : `${money(min)} – ${money(max)}`;
}

export function CatalogPage() {
  const { t, money, label } = useI18n();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [active, setActive] = useState<ActiveFilter>('');
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<'import' | 'bulk' | null>(null);
  const query = useDebounced(q.trim());
  const categories = useCategories();
  const brands = useBrands();

  const filters = {
    q: query || undefined,
    categoryId: categoryId || undefined,
    brandId: brandId || undefined,
    isActive: active || undefined,
    lowStock: lowStock || undefined,
  };
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['products', filters, page],
    queryFn: () => api<Paginated<AdminProduct>>('/admin/products', { query: { ...filters, page, limit: 25 } }),
    placeholderData: (prev) => prev,
  });
  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const columns: Column<AdminProduct>[] = [
    {
      id: 'image',
      header: '',
      className: 'w-14 pr-0',
      hideBelow: 'sm',
      cell: (p) =>
        p.images[0] ? (
          <img src={fileUrl(p.images[0].url)} alt="" loading="lazy" className="size-10 rounded-md object-cover ring-1 ring-border" />
        ) : (
          <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <ImageOff className="size-4" />
          </div>
        ),
    },
    {
      id: 'name',
      header: t('catalog.product'),
      sortValue: (p) => p.nameUz,
      cell: (p) => (
        <div className="min-w-44">
          <p className="font-medium">{p.nameUz}</p>
          <p className="text-xs text-muted-foreground">{[p.code, p.brand?.name].filter(Boolean).join(' · ')}</p>
        </div>
      ),
    },
    { id: 'category', header: t('catalog.category'), hideBelow: 'md', cell: (p) => <span className="text-muted-foreground">{p.category.nameUz}</span> },
    { id: 'variants', header: t('catalog.variants'), hideBelow: 'lg', align: 'right', sortValue: (p) => p.variants.length, cell: (p) => p.variants.length },
    { id: 'price', header: t('catalog.price'), align: 'right', cell: (p) => <span className="whitespace-nowrap tabular">{priceRange(p, money)}</span> },
    {
      id: 'available',
      header: t('catalog.available'),
      align: 'right',
      hideBelow: 'sm',
      sortValue: (p) => p.variants.reduce((s, v) => s + Number(v.availableQty), 0),
      cell: (p) => {
        const low = p.variants.filter((v) => v.isActive && (v.stockLevel === 'LOW' || v.stockLevel === 'OUT_OF_STOCK')).length;
        const available = p.variants.reduce((s, v) => s + Number(v.availableQty), 0);
        return (
          <div className={cn('whitespace-nowrap tabular', low > 0 && 'text-warning')}>
            {available} {label('unit', p.unit)}
            {low > 0 && <p className="text-xs">{t('catalog.lowVariants', { n: low })}</p>}
          </div>
        );
      },
    },
    { id: 'state', header: '', align: 'right', cell: (p) => !p.isActive && <Badge>{t('common.inactive')}</Badge> },
  ];

  return (
    <div>
      <PageHeader title={t('catalog.title')} description={t('catalog.subtitle')}>
        <Button variant="ghost" asChild>
          <Link to="/catalog/categories">
            <FolderTree /> {t('catalog.categories')}
          </Link>
        </Button>
        <Button
          variant="outline"
          onClick={() => void apiDownload('/admin/catalog/export.xlsx', t('catalog.exportFile', { date: new Date().toISOString().slice(0, 10) }))}
        >
          <Download /> {t('catalog.export')}
        </Button>
        <Button variant="outline" onClick={() => setDialog('import')}>
          <Upload /> {t('catalog.import')}
        </Button>
        {can('SUPER_ADMIN') && (
          <Button variant="outline" onClick={() => setDialog('bulk')}>
            <Percent /> {t('catalog.bulkPrice')}
          </Button>
        )}
        <Button onClick={() => navigate('/catalog/new')}>
          <Plus /> {t('catalog.newProduct')}
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-col flex-wrap gap-3 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={resetPage(setQ)} placeholder={t('catalog.search')} loading={isFetching && !!query} />
        <OptionSelect
          className="sm:w-56"
          aria-label={t('catalog.category')}
          value={categoryId}
          onValueChange={resetPage(setCategoryId)}
          emptyLabel={t('catalog.allCategories')}
          options={flattenCategories(categories.data ?? []).map((c) => ({ value: c.id, label: c.label }))}
        />
        <OptionSelect
          className="sm:w-44"
          aria-label={t('product.brand')}
          value={brandId}
          onValueChange={resetPage(setBrandId)}
          emptyLabel={t('catalog.allBrands')}
          options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
        />
        <OptionSelect
          className="sm:w-36"
          aria-label={t('common.status')}
          value={active}
          onValueChange={(v) => isActiveFilter(v) && resetPage(setActive)(v)}
          emptyLabel={t('common.all')}
          options={[
            { value: 'true', label: t('catalog.onSale') },
            { value: 'false', label: t('common.inactive') },
          ]}
        />
        <SwitchField checked={lowStock} onCheckedChange={resetPage(setLowStock)} label={t('catalog.lowStock')} />
      </div>

      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(p) => p.id}
        loading={isPending || isFetching}
        error={error}
        onRetry={() => void refetch()}
        onRowClick={(p) => navigate(`/catalog/${p.id}`)}
        empty={{ icon: PackageSearch, title: t('catalog.empty'), description: t('catalog.emptyHint') }}
        pagination={data && { page, total: data.total, limit: data.limit, onPage: setPage }}
      />

      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
      {dialog === 'bulk' && <BulkPriceDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
