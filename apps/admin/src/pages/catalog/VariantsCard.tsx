import { PackagePlus, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { DataTable, type Column } from '@/components/DataTable';
import { SectionCard } from '@/components/SectionCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { attrsText } from '@/lib/catalog';
import type { AdminProduct, AdminVariant } from '@/lib/types';
import { StockDialog } from '../stock/StockDialog';
import { VariantDialog } from './VariantDialog';

export function VariantsCard({ product }: { product: AdminProduct }) {
  const { t, money, label } = useI18n();
  const [editing, setEditing] = useState<AdminVariant | 'new' | null>(null);
  const [stockFor, setStockFor] = useState<AdminVariant | null>(null);
  const unit = label('unit', product.unit);

  const columns: Column<AdminVariant>[] = [
    { id: 'sku', header: 'SKU', sortValue: (v) => v.sku, cell: (v) => <span className="font-mono text-xs">{v.sku}</span> },
    { id: 'attrs', header: t('product.attributes'), hideBelow: 'sm', cell: (v) => attrsText(v.attributes) || '—' },
    {
      id: 'price',
      header: t('catalog.price'),
      align: 'right',
      sortValue: (v) => v.basePrice,
      cell: (v) => (
        <div className="whitespace-nowrap tabular">
          {money(v.basePrice)}
          {(v.priceTiers.length > 0 || v.groupPrices.length > 0) && (
            <p className="text-xs text-muted-foreground">
              {[v.priceTiers.length > 0 && t('product.tiers', { n: v.priceTiers.length }), v.groupPrices.length > 0 && t('product.groups', { n: v.groupPrices.length })]
                .filter(Boolean)
                .join(', ')}
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'stock',
      header: t('product.stockCol'),
      align: 'right',
      sortValue: (v) => Number(v.availableQty),
      cell: (v) => (
        <div className="whitespace-nowrap tabular">
          {v.availableQty} {unit}
          {Number(v.reservedQty) > 0 && <p className="text-xs text-muted-foreground">{t('product.reserved', { qty: v.reservedQty })}</p>}
        </div>
      ),
    },
    { id: 'level', header: t('product.level'), hideBelow: 'md', cell: (v) => <StatusBadge kind="stockLevel" value={v.stockLevel} /> },
    {
      id: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      align: 'right',
      cell: (v) => (
        <div className="flex justify-end gap-1">
          <Button size="icon-sm" variant="ghost" title={t('product.stockAction')} aria-label={t('product.stockAction')} onClick={() => setStockFor(v)}>
            <PackagePlus />
          </Button>
          <Button size="icon-sm" variant="ghost" title={t('common.edit')} aria-label={t('common.edit')} onClick={() => setEditing(v)}>
            <Pencil />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <SectionCard
      flush
      title={t('product.variants', { n: product.variants.length })}
      actions={
        <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
          <Plus /> {t('product.addVariant')}
        </Button>
      }
    >
      <DataTable
        bare
        columns={columns}
        rows={product.variants}
        rowKey={(v) => v.id}
        rowClassName={(v) => !v.isActive && 'opacity-50'}
        empty={{ title: t('product.noVariants') }}
      />
      {editing && <VariantDialog product={product} variant={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {stockFor && (
        <StockDialog variant={stockFor} unit={product.unit} title={`${product.nameUz} · ${stockFor.sku}`} onClose={() => setStockFor(null)} />
      )}
    </SectionCard>
  );
}
