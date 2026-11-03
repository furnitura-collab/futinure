import { useQuery } from '@tanstack/react-query';
import { Phone } from 'lucide-react';
import { useState } from 'react';
import type { OrderStatus } from '@mebel/shared';
import { AuthFile } from '../../components/AuthFile';
import { Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { api } from '../../lib/api';
import { date, dateTime, phone, som } from '../../lib/format';
import { DELIVERY_STATUS } from '../../lib/labels';
import { useApiMutation } from '../../lib/mutation';
import type { Driver, OrderDetail } from '../../lib/types';

/** Yo'lga chiqqunga qadar haydovchini almashtirish mumkin (API'dagi qoida bilan bir xil) */
const ASSIGNABLE: OrderStatus[] = ['CONFIRMED', 'PREPARING', 'READY'];

/** Yetkazish: haydovchi biriktirish va topshirish natijasi (surat, qabul qilgan, naqd) */
export function DeliveryCard({ order }: { order: OrderDetail }) {
  const d = order.delivery;
  const editable = ASSIGNABLE.includes(order.status);
  const { data: drivers } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api<Driver[]>('/admin/drivers'),
    staleTime: 60_000,
    enabled: editable,
  });
  const [driverId, setDriverId] = useState(d?.driverId ?? '');
  const [day, setDay] = useState((d?.scheduledDate ?? order.deliveryDate ?? '').slice(0, 10));

  const save = useApiMutation(
    () =>
      api(`/admin/orders/${order.id}/delivery`, {
        method: 'PUT',
        body: { driverId: driverId || null, scheduledDate: day || null },
      }),
    { invalidate: [['order', order.id], ['drivers']], success: driverId ? 'Haydovchi biriktirildi' : 'Haydovchi olib tashlandi' },
  );
  const changed = driverId !== (d?.driverId ?? '') || day !== (d?.scheduledDate ?? order.deliveryDate ?? '').slice(0, 10);

  return (
    <Card title="Haydovchi" actions={d?.driver && <Badge tone={DELIVERY_STATUS[d.status].tone}>{DELIVERY_STATUS[d.status].label}</Badge>}>
      <div className="space-y-3 text-sm">
        {d?.driver && (
          <div className="space-y-1">
            <p className="font-medium">{d.driver.fullName ?? '—'}</p>
            <a href={`tel:${d.driver.phone}`} className="flex items-center gap-1 text-brand-700 hover:underline">
              <Phone className="size-3.5" /> {phone(d.driver.phone)}
            </a>
            {d.scheduledDate && <p className="text-stone-500">Reja: {date(d.scheduledDate)}</p>}
          </div>
        )}

        {d?.status === 'FAILED' && d.failReason && <p className="rounded-md bg-rose-50 p-2 text-rose-800">🚫 {d.failReason}</p>}

        {d?.status === 'DELIVERED' && (
          <div className="space-y-1.5 rounded-md bg-emerald-50 p-2">
            <p>Qabul qildi: <span className="font-medium">{d.receiverName}</span></p>
            {d.deliveredAt && <p className="text-xs text-stone-500">{dateTime(d.deliveredAt)}</p>}
            {d.cashCollected !== null && <p>💵 Naqd oldi: <span className="font-medium">{som(d.cashCollected)}</span></p>}
            {d.proofUploadId && <AuthFile path={`/admin/orders/${order.id}/delivery/proof`} mimeType="image/jpeg" className="max-h-48 rounded-lg ring-1 ring-stone-200" />}
          </div>
        )}

        {editable && (
          <div className="space-y-2">
            <Field label="Haydovchi">
              {(id) => (
                <Select id={id} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                  <option value="">— biriktirilmagan —</option>
                  {drivers?.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.fullName ?? phone(x.phone)} · {x._count.deliveries} ta faol
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Yetkazish sanasi">{(id) => <Input id={id} type="date" value={day} onChange={(e) => setDay(e.target.value)} />}</Field>
            <Button size="sm" className="w-full" disabled={!changed} loading={save.isPending} onClick={() => save.mutate(undefined)}>
              Saqlash
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
