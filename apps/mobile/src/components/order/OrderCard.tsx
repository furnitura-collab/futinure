import { router } from 'expo-router';
import { formatDate } from '@mebel/shared';
import { Badge, Card, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { STATUS_TONE } from '@/lib/catalog';
import type { OrderListItem } from '@/lib/types';
import { space } from '@/theme';
import { OrderSignals, useItemsLine } from './OrderSignals';
import { StageProgress } from './OrderStepper';

/** Telefondagi buyurtma kartasi: tovarlar va jami, raqam/sana va holat, bosqich chizig'i, kutilayotgan harakat */
export function OrderCard({ o }: { o: OrderListItem }) {
  const { status, money } = useI18n();
  const items = useItemsLine(o);
  return (
    <Card
      onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
      accessibilityLabel={`${o.number}, ${status(o.status)}`}
      style={{ gap: space(2.5), padding: space(3.5) }}
    >
      <Row between gap={space(3)}>
        <Text bold numberOfLines={1} style={{ flex: 1 }}>{items}</Text>
        <Text bold style={{ fontVariant: ['tabular-nums'] }}>{money(o.grandTotal)}</Text>
      </Row>
      <Row between gap={space(3)}>
        <Text v="caption" numberOfLines={1} style={{ flex: 1 }}>{`${o.number} · ${formatDate(o.createdAt)}`}</Text>
        <Badge label={status(o.status)} tone={STATUS_TONE[o.status]} dot />
      </Row>
      <StageProgress status={o.status} />
      <OrderSignals o={o} />
    </Card>
  );
}
