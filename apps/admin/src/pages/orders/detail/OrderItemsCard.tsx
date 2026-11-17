import { DataTable, type Column } from '@/components/DataTable';
import { SectionCard } from '@/components/SectionCard';
import { TotalsList } from '@/components/TotalsList';
import { useI18n } from '@/i18n';
import { attrsText } from '@/lib/catalog';
import type { OrderDetail, OrderItem } from '@/lib/types';
import { cn } from '@/lib/utils';

function StockNote({ item: i }: { item: OrderItem }) {
  const { t } = useI18n();
  if (!i.stock) return null;
  const text =
    i.stock.onOrder && Number(i.stock.available) < Number(i.qty)
      ? t('order.onOrderBasis')
      : [t('order.inStock', { qty: i.stock.available }), Number(i.stock.reserved) > 0 && t('order.reserved', { qty: i.stock.reserved })]
          .filter(Boolean)
          .join(' · ');
  return <p className={cn('text-xs', i.stock.shortage ? 'font-medium text-destructive' : 'text-muted-foreground')}>{text}</p>;
}

export function OrderItemsCard({ order }: { order: OrderDetail }) {
  const { t, money, label } = useI18n();
  const active = order.items.filter((i) => i.status === 'ACTIVE');
  const removed = order.items.filter((i) => i.status === 'REMOVED');
  const open = order.status !== 'CANCELLED';

  const columns: Column<OrderItem>[] = [
    {
      id: 'item',
      header: t('order.item'),
      cell: (i) => (
        <>
          <p className="font-medium">{i.nameUz}</p>
          <p className="text-xs text-muted-foreground">
            {i.sku}
            {Object.keys(i.attributes).length > 0 && ` · ${attrsText(i.attributes)}`}
          </p>
          <StockNote item={i} />
        </>
      ),
    },
    {
      id: 'qty',
      header: t('order.qty'),
      align: 'right',
      className: 'whitespace-nowrap tabular',
      cell: (i) => (
        <>
          {i.qty} {label('unit', i.unit)}
          {i.requestedQty !== i.qty && <p className="text-xs text-muted-foreground line-through">{i.requestedQty}</p>}
        </>
      ),
    },
    { id: 'price', header: t('order.price'), align: 'right', hideBelow: 'sm', className: 'whitespace-nowrap tabular', cell: (i) => money(i.unitPrice) },
    { id: 'sum', header: t('order.sum'), align: 'right', className: 'font-medium whitespace-nowrap tabular', cell: (i) => money(i.lineTotal) },
  ];

  return (
    <SectionCard title={t('order.items', { n: active.length })} flush>
      <DataTable bare columns={columns} rows={active} rowKey={(i) => i.id} empty={{ title: t('order.items', { n: 0 }) }} />
      <div className="flex flex-col gap-4 border-t px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {removed.length > 0 && t('order.removed', { list: removed.map((i) => `${i.sku} × ${i.requestedQty}`).join(', ') })}
        </p>
        <TotalsList
          className="w-full sm:max-w-xs"
          rows={[
            { label: t('order.itemsTotal'), value: money(order.itemsTotal) },
            order.servicesTotal > 0 && { label: t('order.services'), value: money(order.servicesTotal) },
            order.deliveryFee > 0 && { label: t('order.delivery'), value: money(order.deliveryFee) },
            order.discountTotal > 0 && { label: t('order.discount'), value: `−${money(order.discountTotal)}` },
            { label: t('order.grandTotal'), value: money(order.grandTotal), strong: true },
            { label: t('order.paid'), value: money(order.paidTotal), className: 'text-success' },
            open && order.balanceDue > 0 && { label: t('order.balanceDue'), value: money(order.balanceDue), className: 'font-medium text-warning' },
          ]}
        />
      </div>
    </SectionCard>
  );
}
