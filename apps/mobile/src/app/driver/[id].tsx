import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking, View } from 'react-native';
import { formatDate, formatDateTime, formatPhone } from '@mebel/shared';
import { ContactActions } from '@/components/driver/ContactActions';
import { DeliveryActions, WITH_ACTIONS } from '@/components/driver/DeliveryActions';
import { DeliveryItems } from '@/components/driver/DeliveryItems';
import { Appear, Badge, Card, ErrorState, Row, Screen, SkeletonList, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { DELIVERY_TONE } from '@/lib/catalog';
import { useDriverDelivery } from '@/lib/driver';
import { useApiMutation } from '@/lib/mutation';
import { space } from '@/theme';

/** Bitta yetkazish: manzil (xarita, qo'ng'iroq), olinadigan pul, mijoz, tovarlar va bosqich amali */
export default function DriverDeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, money, terms, deliveryStatus } = useI18n();
  const q = useDriverDelivery(id);

  const start = useApiMutation(() => api(`/driver/deliveries/${id}/start`, { body: { expectedVersion: q.data?.order.version } }), {
    invalidate: [['driver']],
    success: t('drvStarted'),
  });

  const d = q.data;
  if (!d) {
    return <Screen>{q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : <SkeletonList count={4} lines={2} />}</Screen>;
  }
  const o = d.order;
  const a = o.addressSnapshot;
  const c = o.customer;
  const extra = a ? [a.floor !== null ? t('drvFloor', { floor: a.floor }) : null, a.needsLoaders ? t('needsLoaders') : null].filter(Boolean).join(' · ') : '';

  return (
    <Screen
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      footer={
        WITH_ACTIONS.includes(o.status) && (
          <DeliveryActions
            status={o.status}
            starting={start.isPending}
            onStart={() => start.mutate(undefined)}
            onDeliver={() => router.push({ pathname: '/driver/deliver', params: { id } })}
            onFail={() => router.push({ pathname: '/driver/fail', params: { id } })}
          />
        )
      }
    >
      <Stack.Screen options={{ title: o.number }} />
      <Row between>
        <Badge label={deliveryStatus(d.status)} tone={DELIVERY_TONE[d.status]} dot size="md" />
        {d.scheduledDate && <Text v="small" muted>{t('drvPlanned', { date: formatDate(d.scheduledDate) })}</Text>}
      </Row>

      {d.status === 'FAILED' && d.failReason && (
        <Card tone="destructive">
          <Text v="small">{t('drvLastFail', { reason: d.failReason })}</Text>
        </Card>
      )}

      <Appear>
        <Card style={{ gap: space(3) }}>
          <Row style={{ alignItems: 'flex-start' }} gap={space(3)}>
            <View style={{ flex: 1, gap: 2 }}>
              {a?.label ? <Text v="small" muted>{a.label}</Text> : null}
              <Text v="h2">{a?.addressText ?? '—'}</Text>
              {extra ? <Text v="small" muted>{extra}</Text> : null}
            </View>
            <ContactActions order={o} size={52} />
          </Row>
          {a?.comment ? <Text v="small">{a.comment}</Text> : null}
        </Card>
      </Appear>

      <Appear index={1}>
        <Card tone={o.toCollect > 0 ? 'warning' : undefined} style={{ gap: 2 }}>
          {o.toCollect > 0 ? (
            <>
              <Text v="small" muted>
                {t('drvToCollect')}
                {o.paymentTerms ? ` · ${terms(o.paymentTerms)}` : ''}
              </Text>
              <Text v="title">{money(o.toCollect)}</Text>
            </>
          ) : (
            <Text muted>{t('drvNoCollect')}</Text>
          )}
          {d.cashCollected !== null && (
            <Text v="small">
              {t('drvCash')}: {money(d.cashCollected)} — {t('drvCashHint')}
            </Text>
          )}
        </Card>
      </Appear>

      {d.status === 'DELIVERED' && (
        <Card tone="success" style={{ gap: 2 }}>
          <Text>
            {t('drvReceiver')}: <Text bold>{d.receiverName}</Text>
          </Text>
          <Text v="caption">{formatDateTime(d.deliveredAt)}</Text>
        </Card>
      )}

      <Appear index={2}>
        <Card style={{ gap: 2 }}>
          <Text bold>{[c.fullName, c.customerProfile?.companyName].filter(Boolean).join(', ') || '—'}</Text>
          <Text v="small" tone="primary" onPress={() => void Linking.openURL(`tel:${c.phone}`)} accessibilityRole="link">
            {formatPhone(c.phone)}
          </Text>
          {o.customerComment ? <Text v="small" style={{ marginTop: space(1) }}>{o.customerComment}</Text> : null}
        </Card>
      </Appear>

      <Appear index={3}>
        <DeliveryItems order={o} />
      </Appear>
    </Screen>
  );
}
