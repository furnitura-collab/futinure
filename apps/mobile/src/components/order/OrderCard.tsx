import { router } from 'expo-router';
import { View } from 'react-native';
import { formatDate } from '@mebel/shared';
import { Badge, Card, Icon, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { STATUS_TONE } from '@/lib/catalog';
import { orderAction, statusSentenceKey } from '@/lib/orders';
import type { OrderListItem } from '@/lib/types';
import { space } from '@/theme';
import { StageProgress } from './StageProgress';

/** Buyurtma kartasi: nima buyurtma qilingan, qayerda va mijozdan nima kutilmoqda */
export function OrderCard({ o }: { o: OrderListItem }) {
  const { t, status, money, name } = useI18n();
  const action = orderAction(o);
  const more = o.itemsCount - o.preview.length;
  const items = o.preview.map((i) => name(i)).join(', ') + (more > 0 ? ` ${t('moreItems', { n: more })}` : '');

  return (
    <Card onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })} accessibilityLabel={`${o.number}, ${status(o.status)}`} style={{ gap: space(3) }}>
      <Row between>
        <Badge label={status(o.status)} tone={STATUS_TONE[o.status]} dot />
        <Text v="caption">
          {o.number} · {formatDate(o.createdAt)}
        </Text>
      </Row>
      <View style={{ gap: space(1) }}>
        <Text bold numberOfLines={2}>{items}</Text>
        <Text v="small" muted numberOfLines={2}>{t(statusSentenceKey(o.status, o.deliveryType, o.amountDue), { amount: money(o.amountDue) })}</Text>
      </View>
      <StageProgress status={o.status} />
      <Row between style={{ flexWrap: 'wrap', rowGap: space(2) }}>
        <Row gap={space(2)} style={{ flexShrink: 1, flexWrap: 'wrap' }}>
          {action === 'quote' && <Badge size="md" tone="violet" icon="sparkles" label={t('pillQuote')} />}
          {action === 'pay' && <Badge size="md" tone="warning" icon="card" label={t('pillPay', { amount: money(o.amountDue) })} />}
          {o.unreadMessages > 0 && (
            <View accessibilityLabel={t('actMessageTitle', { n: o.unreadMessages })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="chatbubble" size={16} tone="info" />
              <Text v="small" bold tone="info">{o.unreadMessages}</Text>
            </View>
          )}
        </Row>
        <Text v="h2">{money(o.grandTotal)}</Text>
      </Row>
    </Card>
  );
}
