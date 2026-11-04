import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking, View } from 'react-native';
import { formatDate, formatDateTime, formatPhone, type OrderStatus } from '@mebel/shared';
import { Appear, Badge, Button, Card, Divider, ErrorState, Icon, Row, Screen, SkeletonList, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { DELIVERY_TONE } from '@/lib/catalog';
import { mapUrl, useDriverDelivery } from '@/lib/driver';
import { useApiMutation } from '@/lib/mutation';
import { space } from '@/theme';

const WITH_ACTIONS: OrderStatus[] = ['READY', 'OUT_FOR_DELIVERY', 'CONFIRMED', 'PREPARING'];

/** Bitta yetkazish: manzil, mijoz, olinadigan pul, tovarlar va amallar */
export default function DriverDeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, money, unit, name, terms, deliveryStatus } = useI18n();
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
  const call = () => void Linking.openURL(`tel:${c.phone}`);

  return (
    <Screen
      footer={
        WITH_ACTIONS.includes(o.status) && (
        <Actions
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
        <Badge label={deliveryStatus(d.status)} tone={DELIVERY_TONE[d.status]} dot />
        {d.scheduledDate && <Text v="small" muted>{t('drvPlanned', { date: formatDate(d.scheduledDate) })}</Text>}
      </Row>

      {d.status === 'FAILED' && d.failReason && (
        <Card tone="destructive">
          <Text v="small">{t('drvLastFail', { reason: d.failReason })}</Text>
        </Card>
      )}

      {a && (
        <Appear>
          <Card style={{ gap: space(3) }}>
            <Row style={{ alignItems: 'flex-start' }}>
              <Icon name="location" size={20} tone="primary" />
              <View style={{ flex: 1, gap: 2 }}>
                {a.label ? <Text bold>{a.label}</Text> : null}
                <Text>{a.addressText}</Text>
                <Text v="small" muted>
                  {[a.floor !== null ? t('drvFloor', { floor: a.floor }) : null, a.needsLoaders ? t('needsLoaders') : null].filter(Boolean).join(' · ')}
                </Text>
                {a.comment ? <Text v="small">{a.comment}</Text> : null}
              </View>
            </Row>
            <Row>
              <Button title={t('drvMap')} icon="navigate-outline" variant="outline" size="md" style={{ flex: 1 }} onPress={() => void Linking.openURL(mapUrl(a))} />
              <Button title={t('drvCall')} icon="call-outline" variant="outline" size="md" style={{ flex: 1 }} onPress={call} />
            </Row>
          </Card>
        </Appear>
      )}

      <Appear index={1}>
        <Card style={{ gap: 2 }}>
          <Text bold>{[c.fullName, c.customerProfile?.companyName].filter(Boolean).join(', ') || '—'}</Text>
          <Text v="small" tone="primary" onPress={call} accessibilityRole="link">
            {formatPhone(c.phone)}
          </Text>
          {o.customerComment ? <Text v="small" style={{ marginTop: space(1) }}>{o.customerComment}</Text> : null}
        </Card>
      </Appear>

      <Appear index={2}>
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
            <Row gap={6}>
              <Icon name="checkmark-circle-outline" size={18} tone="success" />
              <Text muted>{t('drvNoCollect')}</Text>
            </Row>
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

      <Appear index={3} style={{ gap: space(2) }}>
        <Text v="small" bold>
          {t('drvItems')} ({o.itemsCount}) · {o.totalWeightKg} {t('kg')}
        </Text>
        <Card style={{ paddingVertical: space(1) }}>
          {o.items?.map((i, idx) => (
            <View key={i.id}>
              {idx > 0 && <Divider spacing={0} />}
              <Row between style={{ paddingVertical: space(3), alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text v="small">{name(i)}</Text>
                  <Text v="caption">{[i.sku, Object.values(i.attributes).join(', ')].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text bold>
                  {i.qty} {unit(i.unit)}
                </Text>
              </Row>
            </View>
          ))}
        </Card>
      </Appear>
    </Screen>
  );
}

function Actions(props: { status: OrderStatus; starting: boolean; onStart: () => void; onDeliver: () => void; onFail: () => void }) {
  const { t } = useI18n();
  switch (props.status) {
    case 'READY':
      return <Button title={t('drvStart')} icon="car-outline" loading={props.starting} onPress={props.onStart} />;
    case 'OUT_FOR_DELIVERY':
      return (
        <>
          <Button title={t('drvDeliver')} icon="checkmark-circle-outline" onPress={props.onDeliver} />
          <Button title={t('drvFail')} icon="close-circle-outline" variant="outline" onPress={props.onFail} />
        </>
      );
    case 'CONFIRMED':
    case 'PREPARING':
      return (
        <Row gap={6} style={{ justifyContent: 'center' }}>
          <Icon name="time-outline" size={18} muted />
          <Text muted>{t('drvNotReady')}</Text>
        </Row>
      );
    default:
      return null;
  }
}
