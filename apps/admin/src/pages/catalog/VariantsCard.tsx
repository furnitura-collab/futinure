import { useState } from 'react';
import { DataTable, type Column } from '@/components/DataTable';
import { SectionCard } from '@/components/SectionCard';
import { StatusBadge } from '@/components/StatusBadge';
import { IconButton } from '@/components/IconButton';
import { PackagePlus, Pencil, Plus } from '@/components/icons';
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
    {
      id: 'sku',
      header: 'SKU',
      sortValue: (v) => v.sku,
      // Telefonda (kartada) atributlar va daraja shu yerda — alohida qatorlar yashirin
      cell: (v) => (
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs">{v.sku}</span>
            <span className="sm:hidden">
              <StatusBadge kind="stockLevel" value={v.stockLevel} />
            </span>
          </div>
          <p className="text-sm sm:hidden">{attrsText(v.attributes) || '—'}</p>
        </div>
      ),
    },
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
      card: 'end',
      align: 'right',
      cell: (v) => (
        <div className="flex justify-end gap-0.5">
          <IconButton icon={PackagePlus} label={t('product.stockAction')} onClick={() => setStockFor(v)} />
          <IconButton icon={Pencil} label={t('common.edit')} onClick={() => setEditing(v)} />
        </div>
      ),
    },
  ];

  return (
    <SectionCard
      flush
      title={t('product.variants', { n: product.variants.length })}
      actions={<IconButton icon={Plus} variant="outline" label={t('product.addVariant')} onClick={() => setEditing('new')} />}
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
