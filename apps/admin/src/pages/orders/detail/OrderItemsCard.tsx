import { SectionCard } from '@/components/SectionCard';
import { TotalsList } from '@/components/TotalsList';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

  return (
    <SectionCard title={t('order.items', { n: active.length })} flush>
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-5 text-xs text-muted-foreground uppercase">{t('order.item')}</TableHead>
            <TableHead className="text-right text-xs text-muted-foreground uppercase">{t('order.qty')}</TableHead>
            <TableHead className="hidden text-right text-xs text-muted-foreground uppercase sm:table-cell">{t('order.price')}</TableHead>
            <TableHead className="px-5 text-right text-xs text-muted-foreground uppercase">{t('order.sum')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {active.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="px-5 py-3 whitespace-normal">
                <p className="font-medium">{i.nameUz}</p>
                <p className="text-xs text-muted-foreground">
                  {i.sku}
                  {Object.keys(i.attributes).length > 0 && ` · ${attrsText(i.attributes)}`}
                </p>
                <StockNote item={i} />
              </TableCell>
              <TableCell className="py-3 text-right whitespace-nowrap tabular">
                {i.qty} {label('unit', i.unit)}
                {i.requestedQty !== i.qty && <p className="text-xs text-muted-foreground line-through">{i.requestedQty}</p>}
              </TableCell>
              <TableCell className="hidden py-3 text-right whitespace-nowrap tabular sm:table-cell">{money(i.unitPrice)}</TableCell>
              <TableCell className="px-5 py-3 text-right font-medium whitespace-nowrap tabular">{money(i.lineTotal)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-col gap-4 border-t p-5 sm:flex-row sm:items-end sm:justify-between">
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
