import { useQuery } from '@tanstack/react-query';
import { Banknote, Phone } from 'lucide-react';
import { useState } from 'react';
import { formatDate, formatDateTime, formatPhone, type OrderStatus } from '@mebel/shared';
import { AuthFile } from '@/components/AuthFile';
import { Callout } from '@/components/Callout';
import { FormField } from '@/components/FormField';
import { OptionSelect } from '@/components/OptionSelect';
import { SectionCard } from '@/components/SectionCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import type { Driver, OrderDetail } from '@/lib/types';

/** Yo'lga chiqqunga qadar haydovchini almashtirish mumkin (API'dagi qoida bilan bir xil) */
const ASSIGNABLE: OrderStatus[] = ['PREPARING', 'READY'];

/** Yetkazish: haydovchi biriktirish va topshirish natijasi (surat, qabul qilgan, naqd) */
export function DeliveryCard({ order }: { order: OrderDetail }) {
  const { t, money } = useI18n();
  const d = order.delivery;
  const editable = ASSIGNABLE.includes(order.status);
  const { data: drivers } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api<Driver[]>('/admin/drivers'),
    staleTime: 60_000,
    enabled: editable,
  });
  const initialDay = (d?.scheduledDate ?? order.deliveryDate ?? '').slice(0, 10);
  const [driverId, setDriverId] = useState(d?.driverId ?? '');
  const [day, setDay] = useState(initialDay);

  const save = useApiMutation(
    () => api(`/admin/orders/${order.id}/delivery`, { method: 'PUT', body: { driverId: driverId || null, scheduledDate: day || null } }),
    { invalidate: [['order', order.id], ['drivers']], success: driverId ? t('delivery.assigned') : t('delivery.unassigned') },
  );
  const changed = driverId !== (d?.driverId ?? '') || day !== initialDay;

  return (
    <SectionCard title={t('delivery.title')} actions={d?.driver && <StatusBadge kind="deliveryStatus" value={d.status} />} contentClassName="space-y-3 text-sm">
      {d?.driver && (
        <div className="space-y-1">
          <p className="font-medium">{d.driver.fullName ?? '—'}</p>
          <a href={`tel:${d.driver.phone}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
            <Phone className="size-3.5" /> {formatPhone(d.driver.phone)}
          </a>
          {d.scheduledDate && <p className="text-muted-foreground">{t('delivery.plan', { date: formatDate(d.scheduledDate) })}</p>}
        </div>
      )}

      {d?.status === 'FAILED' && d.failReason && <Callout tone="destructive">{d.failReason}</Callout>}

      {d?.status === 'DELIVERED' && (
        <Callout tone="success" icon={false}>
          <div className="space-y-1.5">
            <p>{t('delivery.received', { name: d.receiverName ?? '—' })}</p>
            {d.deliveredAt && <p className="text-xs text-muted-foreground">{formatDateTime(d.deliveredAt)}</p>}
            {d.cashCollected !== null && (
              <p className="flex items-center gap-1.5">
                <Banknote className="size-4 text-success" /> {t('delivery.cash', { amount: money(d.cashCollected) })}
              </p>
            )}
            {d.proofUploadId && <AuthFile path={`/admin/orders/${order.id}/delivery/proof`} mimeType="image/jpeg" className="max-h-48" />}
          </div>
        </Callout>
      )}

      {editable && (
        <div className="grid gap-3">
          <FormField label={t('delivery.driver')}>
            {(f) => (
              <OptionSelect
                {...f}
                value={driverId}
                onValueChange={setDriverId}
                emptyLabel={t('common.unassigned')}
                options={(drivers ?? []).map((x) => ({
                  value: x.id,
                  label: `${x.fullName ?? formatPhone(x.phone)} · ${t('delivery.activeCount', { n: x._count.deliveries })}`,
                }))}
              />
            )}
          </FormField>
          <FormField label={t('delivery.date')}>{(f) => <Input {...f} type="date" value={day} onChange={(e) => setDay(e.target.value)} />}</FormField>
          <Button size="sm" className="w-full" disabled={!changed} loading={save.isPending} onClick={() => save.mutate(undefined)}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </SectionCard>
  );
}
