import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import type { OrderStatus } from '@mebel/shared';
import { DeliveryInfo } from '@/components/order/DeliveryInfo';
import { OrderHeaderCard } from '@/components/order/OrderHeaderCard';
import { OrderItems } from '@/components/order/OrderItems';
import { PaymentSummary } from '@/components/order/PaymentSummary';
import { Appear, Button, Card, ErrorState, Input, Row, Screen, SkeletonList } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useSite } from '@/lib/layout';
import { useApiMutation } from '@/lib/mutation';
import { orderAction } from '@/lib/orders';
import { useOrderRoom } from '@/lib/realtime';
import type { OrderDetail } from '@/lib/types';
import { space } from '@/theme';

const REORDERABLE: OrderStatus[] = ['COMPLETED', 'DELIVERED', 'CANCELLED'];

export default function Order() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { site } = useSite();
  useOrderRoom(id);
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api<OrderDetail>(`/orders/${id}`) });
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');

  const cancel = useApiMutation(() => api(`/orders/${id}/cancel`, { body: { reason: reason.trim() } }), {
    invalidate: [['order', id], ['orders']],
    onSuccess: () => setCancelling(false),
  });
  const reorder = useApiMutation(() => api(`/cart/reorder/${id}`, { method: 'POST' }), {
    invalidate: [['cart']],
    onSuccess: () => router.navigate('/cart'),
  });

  const o = q.data;
  if (!o) {
    return <Screen>{q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : <SkeletonList count={4} lines={3} />}</Screen>;
  }
  const openChat = () => router.push({ pathname: '/order/[id]/chat', params: { id: o.id } });
  const canReorder = REORDERABLE.includes(o.status) && !orderAction(o);

  const header = <OrderHeaderCard o={o} />;
  const payment = <PaymentSummary o={o} />;
  // To'lov — sarlavha kartasida; pastda doim qo'l ostida chat va (yakunlanganda) qayta buyurtma
  const footer = (
    <Row>
      <Button title={t('chatShort')} accessibilityLabel={t('chat')} variant={canReorder ? 'outline' : 'secondary'} style={{ flex: 1 }} onPress={openChat} />
      {canReorder && <Button title={t('buyAgainShort')} style={{ flex: 1 }} loading={reorder.isPending} onPress={() => reorder.mutate(undefined)} />}
    </Row>
  );

  return (
    <Screen
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      footer={footer}
      title={o.number}
      crumbs={[{ label: t('tabOrders'), href: '/orders' }]}
      aside={
        site ? (
          <>
            {header}
            {payment}
          </>
        ) : undefined
      }
    >
      <Stack.Screen options={{ title: o.number }} />
      {!site && <Appear>{header}</Appear>}
      <Appear index={1}>
        <OrderItems o={o} />
      </Appear>
      <Appear index={2} style={{ gap: space(4) }}>
        <DeliveryInfo o={o} />
        {!site && payment}
      </Appear>

      {cancelling ? (
        <Card style={{ gap: space(3) }}>
          <Input label={t('cancelReason')} value={reason} onChangeText={setReason} autoFocus />
          <Row>
            <Button title={t('back')} variant="outline" onPress={() => setCancelling(false)} style={{ flex: 1 }} />
            <Button
              title={t('cancelOrder')}
              variant="destructive"
              disabled={reason.trim().length < 3}
              loading={cancel.isPending}
              onPress={() => cancel.mutate(undefined)}
              style={{ flex: 1 }}
            />
          </Row>
        </Card>
      ) : (
        o.canCancel && <Button title={t('cancelOrder')} variant="ghost" onPress={() => setCancelling(true)} />
      )}
    </Screen>
  );
}
