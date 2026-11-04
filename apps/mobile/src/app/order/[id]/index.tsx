import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { View, type ScrollView } from 'react-native';
import type { OrderStatus } from '@mebel/shared';
import { DeliveryInfo } from '@/components/order/DeliveryInfo';
import { OrderHeaderCard } from '@/components/order/OrderHeaderCard';
import { OrderItems } from '@/components/order/OrderItems';
import { OrderTracker } from '@/components/order/OrderTracker';
import { PaymentSummary } from '@/components/order/PaymentSummary';
import { QuoteCard } from '@/components/order/QuoteCard';
import { Appear, Button, Card, ErrorState, Input, ListGroup, ListItem, Row, Screen, SkeletonList } from '@/components/ui';
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
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const quoteY = useRef(0);

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
  const canReorder = REORDERABLE.includes(o.status);

  const header = <OrderHeaderCard o={o} onReviewQuote={() => scroll.current?.scrollTo({ y: quoteY.current, animated: true })} />;
  const tracker = <OrderTracker o={o} />;
  const payment = <PaymentSummary o={o} />;
  // Asosiy harakat (taklif/to'lov) sarlavha kartasida; pastda — doim qo'l ostidagi chat va qayta buyurtma
  const footer = (
    <Row>
      <Button title={t('chatShort')} accessibilityLabel={t('chat')} icon="chatbubbles-outline" variant="outline" style={{ flex: 1 }} onPress={openChat} />
      {canReorder && !orderAction(o) && (
        <Button title={t('buyAgainShort')} icon="repeat" style={{ flex: 1 }} loading={reorder.isPending} onPress={() => reorder.mutate(undefined)} />
      )}
    </Row>
  );

  return (
    <Screen
      scrollRef={scroll}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      footer={footer}
      title={o.number}
      crumbs={[{ label: t('tabOrders'), href: '/orders' }]}
      // Saytda o'ngda yopishgan: holat va keyingi qadam, kuzatuv, to'lov
      aside={
        site ? (
          <>
            {header}
            {tracker}
            {payment}
          </>
        ) : undefined
      }
    >
      <Stack.Screen options={{ title: o.number }} />
      {!site && <Appear>{header}</Appear>}

      {o.pendingQuote && (
        <View onLayout={(e) => (quoteY.current = e.nativeEvent.layout.y)}>
          <QuoteCard orderId={o.id} quote={o.pendingQuote} />
        </View>
      )}
      {!site && <Appear index={1}>{tracker}</Appear>}
      <Appear index={2}>
        <OrderItems o={o} />
      </Appear>
      <Appear index={3} style={{ gap: space(4) }}>
        <DeliveryInfo o={o} />
        {!site && payment}
        <ListGroup>
          <ListItem icon="chatbubbles-outline" title={t('chat')} subtitle={t('chatHint')} onPress={openChat} />
        </ListGroup>
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
