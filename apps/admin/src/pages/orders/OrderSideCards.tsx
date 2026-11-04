import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, MapPin, MessageSquareText, Phone, Store, Truck } from 'lucide-react';
import { formatDate, formatDateTime, formatPhone } from '@mebel/shared';
import { BalanceText } from '@/components/BalanceText';
import { OptionSelect } from '@/components/OptionSelect';
import { SectionCard } from '@/components/SectionCard';
import { StatusBadge } from '@/components/StatusBadge';
import { TotalsList } from '@/components/TotalsList';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import type { Manager, OrderDetail } from '@/lib/types';

export function CustomerCard({ order }: { order: OrderDetail }) {
  const { t, money } = useI18n();
  const c = order.customer;
  const p = c.customerProfile;
  return (
    <SectionCard title={t('order.customer')} contentClassName="space-y-1.5 text-sm">
      <p className="font-medium">{c.fullName ?? '—'}</p>
      {p?.companyName && (
        <p>
          {p.companyName}
          {p.inn && <span className="text-muted-foreground"> · {t('order.inn', { inn: p.inn })}</span>}
        </p>
      )}
      <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
        <Phone className="size-3.5" /> {formatPhone(c.phone)}
      </a>
      <p className="text-muted-foreground">
        {t('order.ordersCount', { n: c._count.orders })}
        {p?.priceGroup && ` · ${t('order.priceGroup', { name: p.priceGroup.name })}`}
      </p>
      {p && (
        <TotalsList
          className="mt-3 rounded-lg bg-muted/50 p-3 text-xs"
          rows={[
            { label: t('order.balance'), value: <BalanceText value={p.balanceCached} /> },
            { label: t('order.creditLimit'), value: money(p.creditLimit) },
          ]}
        />
      )}
      {order.creditCheck?.exceeds && (
        <p className="flex items-center gap-1.5 pt-1 text-xs font-medium text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" /> {t('order.limitExceeded', { amount: money(order.creditCheck.exposureAfter) })}
        </p>
      )}
    </SectionCard>
  );
}

export function DeliveryInfoCard({ order }: { order: OrderDetail }) {
  const { t, label } = useI18n();
  const a = order.addressSnapshot;
  const Icon = order.deliveryType === 'PICKUP' ? Store : Truck;
  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" /> {label('deliveryType', order.deliveryType)}
        </span>
      }
      contentClassName="space-y-1.5 text-sm"
    >
      {a && (
        <>
          <p>{a.addressText}</p>
          {(a.floor !== null || a.needsLoaders) && (
            <p className="text-muted-foreground">
              {[a.floor !== null && t('order.floor', { n: a.floor }), a.needsLoaders && t('order.needsLoaders')].filter(Boolean).join(' · ')}
            </p>
          )}
          <a
            className="inline-flex items-center gap-1.5 text-primary hover:underline"
            target="_blank"
            rel="noreferrer"
            href={`https://yandex.uz/maps/?pt=${a.lng},${a.lat}&z=16`}
          >
            <MapPin className="size-3.5" /> {t('order.showOnMap')}
          </a>
        </>
      )}
      {order.pickupWarehouse && <p>{order.pickupWarehouse.name}</p>}
      <p className="text-muted-foreground">{t('order.deliveryDate', { date: formatDate(order.deliveryDate) })}</p>
      <p className="text-muted-foreground">{t('order.weight', { kg: order.totalWeightKg })}</p>
      {order.customerComment && (
        <p className="mt-2 flex gap-2 rounded-lg bg-muted/50 p-2.5">
          <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {order.customerComment}
        </p>
      )}
    </SectionCard>
  );
}

export function PaymentTermsCard({ order }: { order: OrderDetail }) {
  const { t, money, label } = useI18n();
  if (!order.paymentTerms) return null;
  return (
    <SectionCard title={t('order.paymentTerms')} contentClassName="space-y-1.5 text-sm">
      <p className="font-medium">{label('paymentTerms', order.paymentTerms)}</p>
      {order.paymentTerms === 'ADVANCE' && <p>{t('order.advance', { amount: money(order.advanceAmount) })}</p>}
      <p className="text-muted-foreground">{order.allowedMethods.map((m) => label('paymentMethod', m)).join(', ')}</p>
      {order.dueDate && <p>{t('order.dueDate', { date: formatDate(order.dueDate) })}</p>}
    </SectionCard>
  );
}

export function PaymentsCard({ order, onRecord }: { order: OrderDetail; onRecord?: () => void }) {
  const { t, money, label } = useI18n();
  return (
    <SectionCard
      title={t('order.payments')}
      actions={
        onRecord && (
          <Button size="sm" variant="outline" onClick={onRecord}>
            {t('order.recordPayment')}
          </Button>
        )
      }
    >
      {order.payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('order.noPayments')}</p>
      ) : (
        <ul className="space-y-2.5 text-sm">
          {order.payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="font-medium tabular">{money(p.amount)}</span>{' '}
                <span className="text-xs text-muted-foreground">{label('paymentMethod', p.method)}</span>
              </span>
              <StatusBadge kind="paymentStatus" value={p.status} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function ManagerCard({ order }: { order: OrderDetail }) {
  const { t } = useI18n();
  const { data: managers } = useQuery({
    queryKey: ['managers'],
    queryFn: () => api<Manager[]>('/admin/orders/managers'),
    staleTime: 5 * 60_000,
  });
  const assign = useApiMutation(
    (managerId: string | null) => api(`/admin/orders/${order.id}/assign`, { method: 'PATCH', body: { managerId } }),
    { invalidate: [['order', order.id], ['orders']], success: t('order.managerAssigned') },
  );
  return (
    <SectionCard title={t('order.manager')}>
      <OptionSelect
        aria-label={t('order.manager')}
        value={order.managerId ?? ''}
        disabled={assign.isPending}
        onValueChange={(v) => assign.mutate(v || null)}
        emptyLabel={t('common.unassigned')}
        options={(managers ?? []).map((m) => ({ value: m.id, label: m.fullName ?? formatPhone(m.phone) }))}
      />
    </SectionCard>
  );
}

export function HistoryCard({ order }: { order: OrderDetail }) {
  const { t, label } = useI18n();
  return (
    <SectionCard title={t('order.history')}>
      <ol className="relative space-y-4 border-l pl-4 text-sm">
        {order.statusHistory.map((h) => (
          <li key={h.id} className="relative">
            <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-border ring-4 ring-card" />
            <StatusBadge kind="orderStatus" value={h.toStatus} />
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDateTime(h.createdAt)} · {h.actor ? `${h.actor.fullName ?? ''} (${label('role', h.actor.role)})` : t('order.system')}
            </p>
            {h.comment && <p className="mt-0.5">{h.comment}</p>}
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
