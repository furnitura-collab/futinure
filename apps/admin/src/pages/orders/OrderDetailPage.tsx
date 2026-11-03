import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, FileSignature, Phone, Store, Truck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { OrderStatus } from '@mebel/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { date, dateTime, phone, som } from '../../lib/format';
import { DELIVERY, METHOD, PAYMENT_STATUS, QUOTE_ACTION, QUOTE_STATUS, ROLE, STATUS, TERMS, TRANSITION_ACTION, UNIT } from '../../lib/labels';
import { useApiMutation } from '../../lib/mutation';
import { useOrderRoom } from '../../lib/realtime';
import type { Manager, OrderDetail, QuoteView } from '../../lib/types';
import { Badge, Button, Card, cx, ErrorBox, PageLoader, Select } from '../../components/ui';
import { DeliveryCard } from './DeliveryCard';
import { OrderChat } from './OrderChat';
import { QuoteDialog } from './QuoteDialog';
import { RecordPaymentDialog } from './RecordPaymentDialog';
import { TransitionDialog } from './TransitionDialog';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  useOrderRoom(id);
  const { data: order, isPending, error } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api<OrderDetail>(`/admin/orders/${id}`),
  });
  const [transition, setTransition] = useState<{ to: OrderStatus; requiresComment: boolean } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [paying, setPaying] = useState(false);

  if (isPending) return <PageLoader />;
  if (error) return <div className="p-6"><ErrorBox error={error} /></div>;

  const isManager = can('MANAGER', 'SUPER_ADMIN');
  const active = order.items.filter((i) => i.status === 'ACTIVE');
  const removed = order.items.filter((i) => i.status === 'REMOVED');
  const shortage = active.some((i) => i.stock?.shortage);
  const pendingQuote = order.quotes.find((q) => q.status === 'PENDING');
  const forward = order.availableTransitions.filter((t) => t.to !== 'CANCELLED');
  const cancel = order.availableTransitions.find((t) => t.to === 'CANCELLED');

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/orders" className="rounded-md p-1.5 text-stone-500 hover:bg-stone-200">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-mono text-xl font-semibold">{order.number}</h1>
        <Badge tone={STATUS[order.status].tone}>{STATUS[order.status].label}</Badge>
        <span className="text-sm text-stone-500">{dateTime(order.createdAt)}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {isManager && order.canQuote && (
            <Button variant={shortage ? 'primary' : 'secondary'} onClick={() => setQuoting(true)}>
              <FileSignature className="size-4" /> {pendingQuote ? 'Taklifni yangilash' : 'Taklif yuborish'}
            </Button>
          )}
          {forward.map((t) => (
            <Button key={t.to} variant={t.to === 'CONFIRMED' && shortage ? 'secondary' : 'primary'} onClick={() => setTransition(t)}>
              {order.status === 'OUT_FOR_DELIVERY' && t.to === 'READY' ? 'Yetkazilmadi' : (TRANSITION_ACTION[t.to] ?? STATUS[t.to].label)}
            </Button>
          ))}
          {cancel && (
            <Button variant="ghost" className="text-rose-700" onClick={() => setTransition(cancel)}>
              Bekor qilish
            </Button>
          )}
        </div>
      </header>

      {shortage && order.canQuote && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Ba'zi tovarlar omborda yetarli emas. To'g'ridan-to'g'ri tasdiqlab bo'lmaydi — miqdorni tuzatib yoki analog taklif qilib yuboring.
        </div>
      )}
      {order.cancelReason && (
        <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">Bekor qilish sababi: {order.cancelReason}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Tovarlar (${active.length})`}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="pb-2">Tovar</th>
                  <th className="pb-2 text-right">Miqdor</th>
                  <th className="pb-2 text-right">Narx</th>
                  <th className="pb-2 text-right">Summa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {active.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium">{i.nameUz}</p>
                      <p className="text-xs text-stone-500">
                        {i.sku}
                        {Object.keys(i.attributes).length > 0 && ` · ${Object.values(i.attributes).join(', ')}`}
                      </p>
                      {i.stock && (
                        <p className={cx('text-xs', i.stock.shortage ? 'font-medium text-rose-600' : 'text-stone-400')}>
                          {i.stock.onOrder && Number(i.stock.available) < Number(i.qty)
                            ? 'Buyurtma asosida'
                            : `Omborda: ${i.stock.available}${Number(i.stock.reserved) > 0 ? ` (band: ${i.stock.reserved})` : ''}`}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      {i.qty} {UNIT[i.unit]}
                      {i.requestedQty !== i.qty && <p className="text-xs text-stone-400 line-through">{i.requestedQty}</p>}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">{som(i.unitPrice)}</td>
                    <td className="py-2.5 text-right font-medium whitespace-nowrap">{som(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {removed.length > 0 && (
              <p className="mt-3 text-xs text-stone-500">
                Olib tashlangan: {removed.map((i) => `${i.sku} × ${i.requestedQty}`).join(', ')}
              </p>
            )}
            <dl className="mt-4 ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-sm">
              <dt className="text-stone-500">Tovarlar</dt>
              <dd className="text-right">{som(order.itemsTotal)}</dd>
              {order.deliveryFee > 0 && (
                <>
                  <dt className="text-stone-500">Yetkazish</dt>
                  <dd className="text-right">{som(order.deliveryFee)}</dd>
                </>
              )}
              {order.discountTotal > 0 && (
                <>
                  <dt className="text-stone-500">Chegirma</dt>
                  <dd className="text-right">−{som(order.discountTotal)}</dd>
                </>
              )}
              <dt className="font-semibold">Jami</dt>
              <dd className="text-right font-semibold">{som(order.grandTotal)}</dd>
              <dt className="text-stone-500">To'langan</dt>
              <dd className="text-right text-emerald-700">{som(order.paidTotal)}</dd>
              {order.balanceDue > 0 && order.status !== 'CANCELLED' && (
                <>
                  <dt className="text-stone-500">Qoldiq</dt>
                  <dd className="text-right font-medium text-amber-700">{som(order.balanceDue)}</dd>
                </>
              )}
            </dl>
          </Card>

          {order.quotes.length > 0 && (
            <Card title="Takliflar">
              <div className="space-y-4">
                {order.quotes.map((q) => (
                  <QuoteCard key={q.id} quote={q} />
                ))}
              </div>
            </Card>
          )}

          {isManager && <OrderChat orderId={order.id} />}
        </div>

        <div className="space-y-6">
          <CustomerCard order={order} />
          <Card title={<span className="flex items-center gap-2">{order.deliveryType === 'PICKUP' ? <Store className="size-4" /> : <Truck className="size-4" />}{DELIVERY[order.deliveryType]}</span>}>
            <div className="space-y-1.5 text-sm">
              {order.addressSnapshot && (
                <>
                  <p>{order.addressSnapshot.addressText}</p>
                  <p className="text-stone-500">
                    {order.addressSnapshot.floor !== null && `${order.addressSnapshot.floor}-qavat`}
                    {order.addressSnapshot.needsLoaders && ' · yuk tushiruvchi kerak'}
                  </p>
                  <a
                    className="text-brand-700 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://yandex.uz/maps/?pt=${order.addressSnapshot.lng},${order.addressSnapshot.lat}&z=16`}
                  >
                    Xaritada ko'rish
                  </a>
                </>
              )}
              {order.pickupWarehouse && <p>{order.pickupWarehouse.name}</p>}
              <p className="text-stone-500">Sana: {date(order.deliveryDate)}</p>
              <p className="text-stone-500">Og'irlik: {order.totalWeightKg} kg</p>
              {order.customerComment && <p className="rounded-md bg-stone-50 p-2">💬 {order.customerComment}</p>}
            </div>
          </Card>

          {isManager && order.deliveryType === 'DELIVERY' && !['NEW', 'QUOTED', 'CANCELLED'].includes(order.status) && (
            // Server qiymati o'zgarsa (boshqa menejer) — forma qayta boshlanadi
            <DeliveryCard key={`${order.delivery?.driverId}-${order.delivery?.scheduledDate}`} order={order} />
          )}

          {order.paymentTerms && (
            <Card title="To'lov sharti">
              <div className="space-y-1.5 text-sm">
                <p className="font-medium">{TERMS[order.paymentTerms]}</p>
                {order.paymentTerms === 'ADVANCE' && <p>Avans: {som(order.advanceAmount)}</p>}
                <p className="text-stone-500">{order.allowedMethods.map((m) => METHOD[m]).join(', ')}</p>
                {order.dueDate && <p>To'lov muddati: {date(order.dueDate)}</p>}
              </div>
            </Card>
          )}

          <Card
            title="To'lovlar"
            actions={
              isManager &&
              order.balanceDue > 0 &&
              !['NEW', 'QUOTED', 'CANCELLED'].includes(order.status) && (
                <Button size="sm" variant="secondary" onClick={() => setPaying(true)}>To'lov kiritish</Button>
              )
            }
          >
            {order.payments.length === 0 ? (
              <p className="text-sm text-stone-500">To'lov yo'q</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span>
                      {som(p.amount)} <span className="text-xs text-stone-500">{METHOD[p.method]}</span>
                    </span>
                    <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {isManager && <ManagerCard order={order} />}

          <Card title="Tarix">
            <ol className="space-y-3 text-sm">
              {order.statusHistory.map((h) => (
                <li key={h.id} className="border-l-2 border-stone-200 pl-3">
                  <Badge tone={STATUS[h.toStatus].tone}>{STATUS[h.toStatus].label}</Badge>
                  <p className="mt-1 text-xs text-stone-500">
                    {dateTime(h.createdAt)} · {h.actor ? `${h.actor.fullName ?? ''} (${ROLE[h.actor.role]})` : 'Tizim'}
                  </p>
                  {h.comment && <p className="mt-0.5 text-stone-700">{h.comment}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      {transition && <TransitionDialog order={order} {...transition} onClose={() => setTransition(null)} />}
      {quoting && <QuoteDialog order={order} onClose={() => setQuoting(false)} />}
      {paying && <RecordPaymentDialog order={order} onClose={() => setPaying(false)} />}
    </div>
  );
}

function CustomerCard({ order }: { order: OrderDetail }) {
  const c = order.customer;
  const p = c.customerProfile;
  return (
    <Card title="Mijoz">
      <div className="space-y-1.5 text-sm">
        <p className="font-medium">{c.fullName ?? '—'}</p>
        {p?.companyName && <p>{p.companyName}{p.inn && <span className="text-stone-500"> · STIR {p.inn}</span>}</p>}
        <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-brand-700 hover:underline">
          <Phone className="size-3.5" /> {phone(c.phone)}
        </a>
        <p className="text-stone-500">
          {c._count.orders} ta buyurtma{p?.priceGroup && ` · guruh: ${p.priceGroup.name}`}
        </p>
        {p && (
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-md bg-stone-50 p-2 text-xs">
            <span className="text-stone-500">Balans</span>
            <span className={cx('text-right font-medium', p.balanceCached > 0 ? 'text-amber-700' : p.balanceCached < 0 ? 'text-emerald-700' : '')}>
              {p.balanceCached > 0 ? `qarz ${som(p.balanceCached)}` : p.balanceCached < 0 ? `haqdor ${som(-p.balanceCached)}` : '0'}
            </span>
            <span className="text-stone-500">Kredit limiti</span>
            <span className="text-right">{som(p.creditLimit)}</span>
          </div>
        )}
        {order.creditCheck?.exceeds && (
          <p className="flex items-center gap-1 text-xs font-medium text-rose-600">
            <AlertTriangle className="size-3.5" /> Bu buyurtma bilan limitdan oshadi ({som(order.creditCheck.exposureAfter)})
          </p>
        )}
      </div>
    </Card>
  );
}

function ManagerCard({ order }: { order: OrderDetail }) {
  const { data: managers } = useQuery({
    queryKey: ['managers'],
    queryFn: () => api<Manager[]>('/admin/orders/managers'),
    staleTime: 5 * 60_000,
  });
  const assign = useApiMutation(
    (managerId: string | null) => api(`/admin/orders/${order.id}/assign`, { method: 'PATCH', body: { managerId } }),
    { invalidate: [['order', order.id], ['orders']], success: 'Menejer biriktirildi' },
  );
  return (
    <Card title="Menejer">
      <Select value={order.managerId ?? ''} disabled={assign.isPending} onChange={(e) => assign.mutate(e.target.value || null)}>
        <option value="">— biriktirilmagan —</option>
        {managers?.map((m) => (
          <option key={m.id} value={m.id}>{m.fullName ?? phone(m.phone)}</option>
        ))}
      </Select>
    </Card>
  );
}

function QuoteCard({ quote: q }: { quote: QuoteView }) {
  const pending = q.status === 'PENDING';
  return (
    <div className={cx('rounded-lg border p-3', pending ? 'border-violet-300 bg-violet-50/40' : 'border-stone-200')}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Taklif v{q.version}</span>
        <span className="text-xs text-stone-500">
          {QUOTE_STATUS[q.status]} · {dateTime(q.createdAt)}
          {pending && ` · ${dateTime(q.expiresAt)} gacha`}
        </span>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {q.lines
          .filter((l) => l.action !== 'KEEP')
          .map((l, i) => (
            <li key={i} className={QUOTE_ACTION[l.action].tone}>
              <span className="mr-1 text-xs font-semibold uppercase">{QUOTE_ACTION[l.action].label}:</span>
              {l.action === 'REPLACE' && l.replaces && `${l.replaces.nameUz} → `}
              {l.nameUz} · {l.oldQty && l.oldQty !== l.qty ? `${l.oldQty} → ` : ''}
              {l.qty} × {som(l.unitPrice)}
            </li>
          ))}
      </ul>
      <p className="mt-2 text-sm">
        Jami: <span className="font-semibold">{som(q.totals.grandTotal)}</span> · {TERMS[q.paymentTerms]}
        {q.paymentTerms === 'ADVANCE' && ` ${som(q.advanceAmount)}`}
      </p>
      {q.managerNote && <p className="mt-1 text-xs text-stone-600">Menejer: {q.managerNote}</p>}
      {q.customerComment && <p className="mt-1 text-xs text-rose-700">Mijoz: {q.customerComment}</p>}
    </div>
  );
}
