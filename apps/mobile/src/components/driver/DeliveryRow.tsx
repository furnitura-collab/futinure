import { router } from 'expo-router';
import { formatDate } from '@mebel/shared';
import { Badge, Card, PressableScale, Row, Text } from '@/components/ui';
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

  // Xarita/qo'ng'iroq bosiladigan qism ichida emas (web'da tugma ichida tugma bo'lmaydi)
  return (
    <Card style={[o.status === 'OUT_FOR_DELIVERY' && { borderColor: colors.primary, borderWidth: 1.5 }, finished && { opacity: 0.75 }]}>
      <Row style={{ alignItems: 'center' }} gap={space(3)}>
        <PressableScale
          onPress={() => router.push({ pathname: '/driver/[id]', params: { id: o.id } })}
          scale={0.985}
          accessibilityRole="button"
          accessibilityLabel={[o.number, o.addressSnapshot?.addressText].filter(Boolean).join(', ')}
          style={{ flex: 1, gap: space(2) }}
        >
          <Row between>
            <Text bold muted>{o.number}</Text>
            {showDelivery ? <Badge label={deliveryStatus(d.status)} tone={DELIVERY_TONE[d.status]} dot /> : <Badge label={status(o.status)} />}
          </Row>
          <Text v="h2" numberOfLines={3}>{o.addressSnapshot?.addressText ?? '—'}</Text>
          <Text v="small" muted numberOfLines={1}>
            {[o.customer.fullName, o.customer.customerProfile?.companyName].filter(Boolean).join(', ')}
          </Text>
          <Row between>
            <Text v="caption" tone={late ? 'destructive' : undefined}>{meta.filter(Boolean).join(' · ')}</Text>
            {o.toCollect > 0 && !finished && <Text bold tone="warning">{money(o.toCollect)}</Text>}
          </Row>
        </PressableScale>
        {!finished && <ContactActions order={o} />}
      </Row>
    </Card>
  );
}
