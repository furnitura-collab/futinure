import { useQuery } from '@tanstack/react-query';
import { PackageCheck, PackagePlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Unit } from '@mebel/shared';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import type { AdminProduct, LowStockRow } from '@/lib/types';
import { cn } from '@/lib/utils';
import { VariantPicker, type PickedVariant } from '../orders/VariantPicker';
import { StockDialog } from './StockDialog';

interface Target {
  id: string;
  stockQty: string;
  reservedQty: string;
  unit: Unit;
  title: string;
}

/** Ombor: kam qolganlar va istalgan tovarga kirim/inventarizatsiya. Omborchi ham ishlatadi */
export function StockPage() {
  const { t, label } = useI18n();
  const low = useQuery({ queryKey: ['stock-low'], queryFn: () => api<LowStockRow[]>('/admin/stock/low') });
  const [target, setTarget] = useState<Target | null>(null);

  // Aniq qoldiq (fizik va band) uchun mahsulotni yuklaymiz — picker faqat mavjudni beradi
  const fromPicker = async (v: PickedVariant) => {
    const product = await api<AdminProduct>(`/admin/products/${v.productId}`);
    const exact = product.variants.find((x) => x.id === v.variantId);
    if (exact) setTarget({ id: v.variantId, stockQty: exact.stockQty, reservedQty: exact.reservedQty, unit: v.unit, title: `${v.name} · ${v.sku}` });
  };

  const columns: Column<LowStockRow>[] = [
    {
      id: 'name',
      header: t('stock.product'),
      sortValue: (r) => r.name_uz,
      cell: (r) => (
        <div className="min-w-40">
          <Link to={`/catalog/${r.product_id}`} className="font-medium hover:text-primary hover:underline">
            {r.name_uz}
          </Link>
          <p className="font-mono text-xs text-muted-foreground">
            {r.sku}
            {r.on_order && ` · ${t('stock.onOrderBasis')}`}
          </p>
        </div>
      ),
    },
    {
      id: 'available',
      header: t('stock.available'),
      align: 'right',
      sortValue: (r) => Number(r.available_qty),
      cell: (r) => (
        <span className={cn('font-medium whitespace-nowrap tabular', Number(r.available_qty) <= 0 ? 'text-destructive' : 'text-warning')}>
          {r.available_qty} {label('unit', r.unit)}
        </span>
      ),
    },
    { id: 'reserved', header: t('stock.reserved'), align: 'right', hideBelow: 'sm', cell: (r) => <span className="text-muted-foreground tabular">{r.reserved_qty}</span> },
    { id: 'threshold', header: t('stock.threshold'), align: 'right', hideBelow: 'md', cell: (r) => <span className="text-muted-foreground tabular">{r.low_stock_threshold}</span> },
    {
      id: 'action',
      header: <span className="sr-only">{t('common.actions')}</span>,
      align: 'right',
      cell: (r) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setTarget({ id: r.variant_id, stockQty: r.stock_qty, reservedQty: r.reserved_qty, unit: r.unit, title: `${r.name_uz} · ${r.sku}` })}
        >
          <PackagePlus /> <span className="hidden sm:inline">{t('stock.receive')}</span>
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t('stock.title')} description={t('stock.subtitle')} />
      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2" title={t('stock.low')} flush>
          <DataTable
            bare
            columns={columns}
            rows={low.data}
            rowKey={(r) => r.variant_id}
            loading={low.isPending}
            error={low.error}
            onRetry={() => void low.refetch()}
            empty={{ icon: PackageCheck, title: t('stock.allGood'), description: t('stock.allGoodHint') }}
          />
        </SectionCard>
        <SectionCard title={t('stock.findTitle')} description={t('stock.findHint')} className="self-start">
          <VariantPicker onPick={(v) => void fromPicker(v)} />
        </SectionCard>
      </div>
      {target && <StockDialog variant={target} unit={target.unit} title={target.title} onClose={() => setTarget(null)} />}
    </div>
  );
}
