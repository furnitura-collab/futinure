import type { ReactNode } from 'react';
import { formatDate } from '@mebel/shared';
import { IconLink } from '@/components/IconLink';
import { Inset } from '@/components/Inset';
import { MapPin } from '@/components/icons';
import { SectionCard } from '@/components/SectionCard';
import { useI18n } from '@/i18n';
import type { OrderDetail } from '@/lib/types';

/** Yetkazish yoki olib ketish: manzil, sana, og'irlik, mijoz izohi; `children` — haydovchi bo'limi */
export function DeliverySection({ order, children }: { order: OrderDetail; children?: ReactNode }) {
  const { t, label } = useI18n();
  const a = order.addressSnapshot;
  const extras = a && [a.floor !== null && t('order.floor', { n: a.floor }), a.needsLoaders && t('order.needsLoaders')].filter(Boolean);
  return (
    <SectionCard
      title={label('deliveryType', order.deliveryType)}
      actions={a && <IconLink href={`https://yandex.uz/maps/?pt=${a.lng},${a.lat}&z=16`} icon={MapPin} label={t('order.showOnMap')} external />}
      contentClassName="space-y-1.5 text-sm"
    >
      {a && <p>{a.addressText}</p>}
      {order.pickupWarehouse && <p>{order.pickupWarehouse.name}</p>}
      <p className="text-xs text-muted-foreground">
        {[...(extras || []), t('order.deliveryDate', { date: formatDate(order.deliveryDate) }), t('order.weight', { kg: order.totalWeightKg })].join(' · ')}
      </p>
      {order.customerComment && <Inset className="whitespace-pre-wrap">{order.customerComment}</Inset>}
      {children}
    </SectionCard>
  );
}
