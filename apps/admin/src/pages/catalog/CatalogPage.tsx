import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { DataTable } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { OptionSelect } from '@/components/OptionSelect';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { SwitchField } from '@/components/SwitchField';
import { Toolbar } from '@/components/Toolbar';
import { ToolbarActions } from '@/components/ToolbarActions';
import { Download, FolderTree, PackageSearch, Percent, Upload } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { api, apiDownload } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { flattenCategories, useBrands, useCategories } from '@/lib/catalog';
import { useDebounced } from '@/lib/hooks';
import type { AdminProduct, Paginated } from '@/lib/types';
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
          <ToolbarActions
            items={[
              { icon: FolderTree, label: t('catalog.categories'), to: '/catalog/categories' },
              {
                icon: Download,
                label: t('catalog.export'),
                onClick: () => void apiDownload('/admin/catalog/export.xlsx', t('catalog.exportFile', { date: new Date().toISOString().slice(0, 10) })),
              },
              { icon: Upload, label: t('catalog.import'), onClick: () => setDialog('import') },
              ...(can('SUPER_ADMIN') ? [{ icon: Percent, label: t('catalog.bulkPrice'), onClick: () => setDialog('bulk') }] : []),
            ]}
          />
        }
      >
        <FilterBar
          search={<SearchInput value={q} onChange={resetPage(setQ)} placeholder={t('catalog.search')} loading={isFetching && !!query} />}
          onReset={() => {
            setCategoryId('');
            setBrandId('');
            setActive('');
            setLowStock(false);
            setPage(1);
          }}
          filters={[
            {
              id: 'category',
              label: t('catalog.category'),
              active: !!categoryId,
              node: (
                <OptionSelect
                  className="sm:w-52"
                  aria-label={t('catalog.category')}
                  value={categoryId}
                  onValueChange={resetPage(setCategoryId)}
                  emptyLabel={t('catalog.allCategories')}
                  options={flattenCategories(categories.data ?? []).map((c) => ({ value: c.id, label: c.label }))}
                />
              ),
            },
            {
              id: 'brand',
              label: t('product.brand'),
              active: !!brandId,
              node: (
                <OptionSelect
                  className="sm:w-40"
                  aria-label={t('product.brand')}
                  value={brandId}
                  onValueChange={resetPage(setBrandId)}
                  emptyLabel={t('catalog.allBrands')}
                  options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
                />
              ),
            },
            {
              id: 'status',
              label: t('common.status'),
              active: !!active,
              node: (
                <OptionSelect
                  className="sm:w-32"
                  aria-label={t('common.status')}
                  value={active}
                  onValueChange={(v) => isActiveFilter(v) && resetPage(setActive)(v)}
                  emptyLabel={t('common.all')}
                  options={[
                    { value: 'true', label: t('catalog.onSale') },
                    { value: 'false', label: t('common.inactive') },
                  ]}
                />
              ),
            },
            {
              id: 'low',
              label: t('catalog.lowStock'),
              active: lowStock,
              node: <SwitchField className="shrink-0 whitespace-nowrap" checked={lowStock} onCheckedChange={resetPage(setLowStock)} label={t('catalog.lowStock')} />,
            },
          ]}
        />
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
