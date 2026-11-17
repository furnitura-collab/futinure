import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { DataTable } from '@/components/DataTable';
import { IconButton } from '@/components/IconButton';
import { OptionSelect } from '@/components/OptionSelect';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { SwitchField } from '@/components/SwitchField';
import { Toolbar } from '@/components/Toolbar';
import { Download, FolderTree, PackageSearch, Percent, Upload } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { SCROLL_ROW } from '@/components/ScrollRow';
import { useI18n } from '@/i18n';
import { api, apiDownload } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { flattenCategories, useBrands, useCategories } from '@/lib/catalog';
import { useDebounced } from '@/lib/hooks';
import type { AdminProduct, Paginated } from '@/lib/types';
import { cn } from '@/lib/utils';
import { BulkPriceDialog } from './BulkPriceDialog';
import { ImportDialog } from './ImportDialog';
import { useProductColumns } from './productColumns';

type ActiveFilter = '' | 'true' | 'false';
const isActiveFilter = (v: string): v is ActiveFilter => v === '' || v === 'true' || v === 'false';

export function CatalogPage() {
  const { t } = useI18n();
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
    placeholderData: keepPreviousData,
  });
  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const columns = useProductColumns();

  return (
    <div>
      <PageHeader title={t('catalog.title')} description={t('catalog.subtitle')}>
        <Button onClick={() => navigate('/catalog/new')}>{t('catalog.newProduct')}</Button>
      </PageHeader>

      <Toolbar
        className="mb-3"
        actions={
          <>
            <IconButton icon={FolderTree} label={t('catalog.categories')} to="/catalog/categories" />
            <IconButton
              icon={Download}
              label={t('catalog.export')}
              onClick={() => void apiDownload('/admin/catalog/export.xlsx', t('catalog.exportFile', { date: new Date().toISOString().slice(0, 10) }))}
            />
            <IconButton icon={Upload} label={t('catalog.import')} onClick={() => setDialog('import')} />
            {can('SUPER_ADMIN') && <IconButton icon={Percent} label={t('catalog.bulkPrice')} onClick={() => setDialog('bulk')} />}
          </>
        }
      >
        <SearchInput className="max-sm:min-w-0 max-sm:flex-1" value={q} onChange={resetPage(setQ)} placeholder={t('catalog.search')} loading={isFetching && !!query} />
        {/* Telefonda filtrlar bitta gorizontal aylanadigan qatorda; kattaroq ekranda — asboblar qatorining qismi */}
        <div className={cn(SCROLL_ROW, 'order-last')}>
          <OptionSelect
            className="max-sm:w-auto max-sm:max-w-52 max-sm:shrink-0 sm:w-52"
            aria-label={t('catalog.category')}
            value={categoryId}
            onValueChange={resetPage(setCategoryId)}
            emptyLabel={t('catalog.allCategories')}
            options={flattenCategories(categories.data ?? []).map((c) => ({ value: c.id, label: c.label }))}
          />
          <OptionSelect
            className="max-sm:w-auto max-sm:max-w-52 max-sm:shrink-0 sm:w-40"
            aria-label={t('product.brand')}
            value={brandId}
            onValueChange={resetPage(setBrandId)}
            emptyLabel={t('catalog.allBrands')}
            options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          />
          <OptionSelect
            className="max-sm:w-auto max-sm:max-w-52 max-sm:shrink-0 sm:w-32"
            aria-label={t('common.status')}
            value={active}
            onValueChange={(v) => isActiveFilter(v) && resetPage(setActive)(v)}
            emptyLabel={t('common.all')}
            options={[
              { value: 'true', label: t('catalog.onSale') },
              { value: 'false', label: t('common.inactive') },
            ]}
          />
          <SwitchField className="shrink-0 whitespace-nowrap" checked={lowStock} onCheckedChange={resetPage(setLowStock)} label={t('catalog.lowStock')} />
        </div>
      </Toolbar>

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
