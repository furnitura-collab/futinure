import { router } from 'expo-router';
import { View } from 'react-native';
import { formatDate, formatDateTime } from '@mebel/shared';
import { Badge, Button, Card, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { STATUS_TONE } from '@/lib/catalog';
import { orderAction, statusSentenceKey } from '@/lib/orders';
import type { OrderDetail } from '@/lib/types';
import { space } from '@/theme';

/** Buyurtma "yuragi": holat, bir jumlada keyingi qadam va (kerak bo'lsa) asosiy harakat */
export function OrderHeaderCard({ o, onReviewQuote }: { o: OrderDetail; onReviewQuote: () => void }) {
  const { t, status, money } = useI18n();
  const action = orderAction(o);
  return (
    <Card style={{ gap: space(3) }}>
      <Row between>
        <Badge size="md" label={status(o.status)} tone={STATUS_TONE[o.status]} dot />
        <Text v="caption">{formatDateTime(o.createdAt)}</Text>
      </Row>
      <View style={{ gap: space(1) }}>
        <Text v="h2">{t(statusSentenceKey(o.status, o.deliveryType, o.amountDue), { amount: money(o.amountDue) })}</Text>
        {o.deliveryDate && o.status !== 'CANCELLED' ? <Text v="small" muted>{t('plannedDate', { date: formatDate(o.deliveryDate) })}</Text> : null}
      </View>
      {action === 'quote' && <Button title={t('reviewQuote')} onPress={onReviewQuote} />}
      {action === 'pay' && (
        <Button title={t('payAmount', { amount: money(o.amountDue) })} onPress={() => router.push({ pathname: '/pay', params: { orderId: o.id } })} />
      )}
    </Card>
  );
}
