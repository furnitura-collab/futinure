import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { formatDateTime, type OrderStatus } from '@mebel/shared';
import { Callout } from '@/components/Callout';
import { CopyButton } from '@/components/CopyButton';
import { ErrorState } from '@/components/ErrorState';
import { MANAGERS } from '@/components/nav';
import { PageHeader } from '@/components/PageHeader';
import { PageSkeleton } from '@/components/PageSkeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOrderRoom } from '@/lib/realtime';
import type { OrderDetail } from '@/lib/types';
import { CustomerCard } from './CustomerCard';
import { DeliveryAssign } from './DeliveryAssign';
import { DeliverySection } from './DeliverySection';
import { HistoryCard } from './HistoryCard';
import { ManagerSelect } from './ManagerSelect';
import { OrderChat } from './OrderChat';
import { OrderItemsCard } from './OrderItemsCard';
import { OrderProgress } from './OrderProgress';
import { PaymentCard } from './PaymentCard';
import { RecordPaymentDialog } from './RecordPaymentDialog';
import { requiredPrepayment } from './TermsForm';
import { TransitionDialog } from './TransitionDialog';

/** Haydovchi faqat qabul qilingan buyurtmaga */
const NOT_ACCEPTED: OrderStatus[] = ['NEW', 'CANCELLED'];

type Transition = OrderDetail['availableTransitions'][number];

export function OrderDetailPage() {
  const { t, money } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  useOrderRoom(id);
  const { data: order, isPending, error, refetch } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api<OrderDetail>(`/admin/orders/${id}`),
  });
  const [transition, setTransition] = useState<Transition | null>(null);
  const [paying, setPaying] = useState(false);

  if (isPending) return <PageSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const isManager = can(...MANAGERS);
  const shortage = order.items.some((i) => i.status === 'ACTIVE' && i.stock?.shortage);
  const forward = order.availableTransitions.filter((tr) => tr.to !== 'CANCELLED');
  const cancel = order.availableTransitions.find((tr) => tr.to === 'CANCELLED');
  const accepted = !NOT_ACCEPTED.includes(order.status);
  // To'lov shartlar belgilangach qabul qilinadi (yangi buyurtmada ham — avans)
  const payable = !!order.paymentTerms && order.status !== 'CANCELLED';
  // Shartlar saqlangan, oldindan to'lov hali kelmagan — mijoz to'lovini kutyapmiz
  const required = order.canSetTerms ? requiredPrepayment(order.paymentTerms, order.grandTotal, order.advanceAmount) : 0;
  const awaitingPayment = required > order.paidTotal;
  const actionText = (to: OrderStatus) =>
    order.status === 'NEW' && to === 'PREPARING'
      ? t('order.accept')
      : order.status === 'OUT_FOR_DELIVERY' && to === 'READY'
        ? t('order.notDelivered')
        : t(`order.action.${to}`);

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ to: '/orders', label: t('order.back') }}
        title={<span className="font-mono">{order.number}</span>}
        meta={
          <>
            <CopyButton value={order.number} label={t('order.copyNumber')} />
            <StatusBadge kind="orderStatus" value={order.status} />
            <span className="text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</span>
          </>
        }
      >
        {cancel && (
          <Button variant="ghost-destructive" onClick={() => setTransition(cancel)}>
            {t('order.action.CANCELLED')}
          </Button>
        )}
        {forward.map((tr) => (
          <Button key={tr.to} onClick={() => setTransition(tr)}>
            {actionText(tr.to)}
          </Button>
        ))}
      </PageHeader>

      {(order.status !== 'CANCELLED' || isManager) && (
        <div className="surface flex flex-col gap-3 rounded-xl border px-4 py-3 lg:flex-row lg:items-center">
          <OrderProgress order={order} />
          {isManager && <ManagerSelect order={order} />}
        </div>
      )}

      <div className="space-y-2 empty:hidden">
        {shortage && order.canSetTerms && <Callout tone="warning">{t('order.shortage')}</Callout>}
        {awaitingPayment && <Callout tone="info">{t('order.termsAwaitPayment', { required: money(required), paid: money(order.paidTotal) })}</Callout>}
        {order.cancelReason && <Callout tone="destructive">{t('order.cancelReason', { reason: order.cancelReason })}</Callout>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <OrderItemsCard order={order} />
          {isManager && <OrderChat orderId={order.id} />}
        </div>
        <div className="min-w-0 space-y-4">
          <CustomerCard order={order} />
          <DeliverySection order={order}>
            {isManager && order.deliveryType === 'DELIVERY' && accepted && (
              // Server qiymati o'zgarsa (boshqa menejer) — forma qayta boshlanadi
              <DeliveryAssign key={`${order.delivery?.driverId}-${order.delivery?.scheduledDate}`} order={order} />
            )}
          </DeliverySection>
          <PaymentCard order={order} onRecord={isManager && order.balanceDue > 0 && payable ? () => setPaying(true) : undefined} />
          <HistoryCard order={order} />
        </div>
      </div>

      {transition && <TransitionDialog order={order} {...transition} onClose={() => setTransition(null)} />}
      {paying && <RecordPaymentDialog order={order} onClose={() => setPaying(false)} />}
    </div>
  );
}
