import { router } from 'expo-router';
import { View } from 'react-native';
import { formatDate } from '@mebel/shared';
import { Badge, Card, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { DELIVERY_TONE } from '@/lib/catalog';
import { plannedDay } from '@/lib/driver';
import type { DriverDelivery } from '@/lib/types';
import { space, useTheme } from '@/theme';
import { ContactActions } from './ContactActions';

/** Ro'yxatdagi yetkazish: manzil katta, yonida xarita/qo'ng'iroq; bosilsa — batafsil */
export function DeliveryRow({ d, today }: { d: DriverDelivery; today: string }) {
  const { t, status, money, deliveryStatus } = useI18n();
  const { colors } = useTheme();
  const o = d.order;
  const planned = plannedDay(d);
  const finished = d.status === 'DELIVERED' || d.status === 'FAILED';
  const late = !!planned && planned < today && !finished;
  const showDelivery = o.status === 'OUT_FOR_DELIVERY' || o.status === 'READY' || finished;
  const meta = [planned && planned !== today ? t('drvPlanned', { date: formatDate(d.scheduledDate) }) : null, `${o.totalWeightKg} ${t('kg')}`];

  return (
    <Card
      onPress={() => router.push({ pathname: '/driver/[id]', params: { id: o.id } })}
      accessibilityLabel={[o.number, o.addressSnapshot?.addressText].filter(Boolean).join(', ')}
      style={[{ gap: space(3) }, o.status === 'OUT_FOR_DELIVERY' && { borderColor: colors.primary, borderWidth: 1.5 }, finished && { opacity: 0.75 }]}
    >
      <Row between>
        <Text bold muted>{o.number}</Text>
        {showDelivery ? <Badge label={deliveryStatus(d.status)} tone={DELIVERY_TONE[d.status]} dot /> : <Badge label={status(o.status)} />}
      </Row>
      <Row style={{ alignItems: 'flex-start' }} gap={space(3)}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text v="h2" numberOfLines={3}>{o.addressSnapshot?.addressText ?? '—'}</Text>
          <Text v="small" muted numberOfLines={1}>
            {[o.customer.fullName, o.customer.customerProfile?.companyName].filter(Boolean).join(', ')}
          </Text>
        </View>
        {!finished && <ContactActions order={o} />}
      </Row>
      <Row between>
        <Text v="caption" tone={late ? 'destructive' : undefined}>{meta.filter(Boolean).join(' · ')}</Text>
        {o.toCollect > 0 && !finished && <Text bold tone="warning">{money(o.toCollect)}</Text>}
      </Row>
    </Card>
  );
}
