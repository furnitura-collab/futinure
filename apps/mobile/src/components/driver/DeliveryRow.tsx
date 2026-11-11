import { router } from 'expo-router';
import { formatDate } from '@mebel/shared';
import { Badge, Card, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { DELIVERY_TONE } from '@/lib/catalog';
import type { DriverDelivery } from '@/lib/types';
import { space, useTheme } from '@/theme';

export function DeliveryRow({ d, today }: { d: DriverDelivery; today: string }) {
  const { t, status, money, deliveryStatus } = useI18n();
  const { colors } = useTheme();
  const o = d.order;
  const planned = d.scheduledDate?.slice(0, 10);
  const late = planned && planned < today && o.status !== 'DELIVERED' && o.status !== 'COMPLETED';
  const showDelivery = o.status === 'OUT_FOR_DELIVERY' || o.status === 'READY' || d.status === 'DELIVERED' || d.status === 'FAILED';

  return (
    <Card
      onPress={() => router.push({ pathname: '/driver/[id]', params: { id: o.id } })}
      accessibilityLabel={o.number}
      style={[{ gap: space(2) }, o.status === 'OUT_FOR_DELIVERY' && { borderColor: colors.primary, borderWidth: 1.5 }]}
    >
      <Row between>
        <Text v="h2">{o.number}</Text>
        {showDelivery ? <Badge label={deliveryStatus(d.status)} tone={DELIVERY_TONE[d.status]} dot /> : <Badge label={status(o.status)} />}
      </Row>
      <Row style={{ alignItems: 'flex-start' }} gap={6}>
        <Text numberOfLines={2} style={{ flex: 1 }}>{o.addressSnapshot?.addressText ?? '—'}</Text>
      </Row>
      <Text v="small" muted numberOfLines={1}>
        {[o.customer.fullName, o.customer.customerProfile?.companyName].filter(Boolean).join(', ')}
      </Text>
      <Row between>
        <Text v="caption" tone={late ? 'destructive' : undefined}>
          {[planned ? t('drvPlanned', { date: formatDate(d.scheduledDate) }) : null, `${o.totalWeightKg} ${t('kg')}`].filter(Boolean).join(' · ')}
        </Text>
        {o.toCollect > 0 && (
          <Row gap={4}>
            <Text v="small" bold tone="warning">{money(o.toCollect)}</Text>
          </Row>
        )}
      </Row>
    </Card>
  );
}
