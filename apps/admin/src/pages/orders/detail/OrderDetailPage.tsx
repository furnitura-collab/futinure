import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { formatDateTime, type OrderStatus } from '@mebel/shared';
import { Callout } from '@/components/Callout';
import { CopyButton } from '@/components/CopyButton';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { PageSkeleton } from '@/components/PageSkeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOrderRoom } from '@/lib/realtime';
import type { OrderDetail } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CustomerCard } from './CustomerCard';
import { DeliveryAssign } from './DeliveryAssign';
import { DeliverySection } from './DeliverySection';
import { HistoryCard } from './HistoryCard';
import { ManagerSelect } from './ManagerSelect';
import { ActionBar, HeaderActions, type Transition } from './OrderActions';
import { OrderChat } from './OrderChat';
import { OrderItemsCard } from './OrderItemsCard';
import { OrderProgress } from './OrderProgress';
import { PaymentCard } from './PaymentCard';
import { RecordPaymentDialog } from './RecordPaymentDialog';
import { requiredPrepayment } from './TermsForm';
import { TransitionDialog } from './TransitionDialog';

/** Haydovchi faqat qabul qilingan buyurtmaga */
const NOT_ACCEPTED: OrderStatus[] = ['NEW', 'CANCELLED'];

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

  // Omborchi: tarkib, bosqichlar va o'z tugmalari; boshqaruv, chat va moliya — menejerda
  const manage = can('orders.manage');
  const finance = can('orders.finance');
  const shortage = order.items.some((i) => i.status === 'ACTIVE' && i.stock?.shortage);
  const hasActions = order.availableTransitions.length > 0;
  const accepted = !NOT_ACCEPTED.includes(order.status);
  // To'lov shartlar belgilangach qabul qilinadi (yangi buyurtmada ham — avans)
  const payable = !!order.paymentTerms && order.status !== 'CANCELLED';
  // Shartlar saqlangan, oldindan to'lov hali kelmagan — mijoz to'lovini kutyapmiz
  const required = order.canSetTerms ? requiredPrepayment(order.paymentTerms, order.grandTotal, order.advanceAmount) : 0;
  const awaitingPayment = required > order.paidTotal;

  return (
    // Pastki yopishgan panel (< lg) kontent oxirini to'smasin
    <div className={cn('space-y-4', hasActions && 'max-lg:pb-16')}>
      <PageHeader
        // Telefonda amallar sarlavhada emas (pastki panelda) — bo'sh oraliq qolmasin
        className="max-sm:gap-0"
        back={{ to: '/orders', label: t('order.back') }}
        title={<span className="font-mono">{order.number}</span>}
        meta={
          <>
            <CopyButton value={order.number} label={t('order.copyNumber')} />
            <StatusBadge kind="orderStatus" value={order.status} />
            <span className="text-xs text-muted-foreground tabular">{formatDateTime(order.createdAt)}</span>
          </>
        }
      >
        {hasActions && <HeaderActions order={order} onPick={setTransition} />}
      </PageHeader>

      {(order.status !== 'CANCELLED' || manage) && (
        <div className="surface flex flex-col gap-3 rounded-xl border px-4 py-3 lg:flex-row lg:items-center">
          <OrderProgress order={order} />
          {manage && <ManagerSelect order={order} />}
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
          {can('orders.chat') && <OrderChat orderId={order.id} />}
        </div>
        <div className="min-w-0 space-y-4">
          <CustomerCard order={order} />
          <DeliverySection order={order}>
            {manage && order.deliveryType === 'DELIVERY' && accepted && (
              // Server qiymati o'zgarsa (boshqa menejer) — forma qayta boshlanadi
              <DeliveryAssign key={`${order.delivery?.driverId}-${order.delivery?.scheduledDate}`} order={order} />
            )}
          </DeliverySection>
          {finance && <PaymentCard order={order} onRecord={order.balanceDue > 0 && payable ? () => setPaying(true) : undefined} />}
          <HistoryCard order={order} />
        </div>
      </div>

      {hasActions && <ActionBar order={order} onPick={setTransition} />}
      {transition && <TransitionDialog order={order} {...transition} onClose={() => setTransition(null)} />}
      {paying && <RecordPaymentDialog order={order} onClose={() => setPaying(false)} />}
    </div>
  );
}
