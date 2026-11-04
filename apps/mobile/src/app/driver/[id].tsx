import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { Badge, Button, Card, Divider, ErrorView, Ionicons, Loader, Row, Text } from '../../components/ui';
import { api } from '../../lib/api';
import { DELIVERY_TONE, mapUrl, useDriverDelivery } from '../../lib/driver';
import { date, dateTime, phone, som } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { useApiMutation } from '../../lib/mutation';
import { colors, space } from '../../lib/theme';
import { contained, CONTENT } from '../../lib/layout';

/** Bitta yetkazish: manzil, mijoz, olinadigan pul, tovarlar va amallar */
export default function DriverDeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, unit, name, terms } = useI18n();
  const q = useDriverDelivery(id);

  const start = useApiMutation(
    () => api(`/driver/deliveries/${id}/start`, { body: { expectedVersion: q.data?.order.version } }),
    { invalidate: [['driver']], success: t('drvStarted') },
  );

  if (q.isPending) return <Loader />;
  if (q.error) return <ErrorView error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const o = d.order;
  const a = o.addressSnapshot;
  const c = o.customer;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: o.number }} />
      <ScrollView contentContainerStyle={{ ...contained(CONTENT.page), padding: space(4), gap: space(4) }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Badge label={t(`ds${d.status}`)} tone={DELIVERY_TONE[d.status]} />
          {d.scheduledDate && <Text v="small" muted>{t('drvPlanned', { date: date(d.scheduledDate) })}</Text>}
        </Row>

        {d.status === 'FAILED' && d.failReason && (
          <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }}>
            <Text v="small">{t('drvLastFail', { reason: d.failReason })}</Text>
          </Card>
        )}

        {a && (
          <Card style={{ gap: space(2) }}>
            <Row style={{ alignItems: 'flex-start' }}>
              <Ionicons name="location-outline" size={20} color={colors.brand} />
              <View style={{ flex: 1, gap: 2 }}>
                {a.label ? <Text bold>{a.label}</Text> : null}
                <Text>{a.addressText}</Text>
                <Text v="small" muted>
                  {[a.floor !== null ? t('drvFloor', { floor: a.floor }) : null, a.needsLoaders ? t('drvLoaders') : null].filter(Boolean).join(' · ')}
                </Text>
                {a.comment ? <Text v="small">💬 {a.comment}</Text> : null}
              </View>
            </Row>
            <Row>
              <Button title={t('drvMap')} icon="navigate-outline" variant="secondary" small style={{ flex: 1 }} onPress={() => void Linking.openURL(mapUrl(a))} />
              <Button title={t('drvCall')} icon="call-outline" variant="secondary" small style={{ flex: 1 }} onPress={() => void Linking.openURL(`tel:${c.phone}`)} />
            </Row>
          </Card>
        )}

        <Card style={{ gap: 2 }}>
          <Text bold>{[c.fullName, c.customerProfile?.companyName].filter(Boolean).join(', ') || '—'}</Text>
          <Pressable onPress={() => void Linking.openURL(`tel:${c.phone}`)} hitSlop={6}>
            <Text v="small" color={colors.brand}>{phone(c.phone)}</Text>
          </Pressable>
          {o.customerComment ? <Text v="small" style={{ marginTop: space(1) }}>💬 {o.customerComment}</Text> : null}
        </Card>

        <Card style={{ gap: 2, ...(o.toCollect > 0 && { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft }) }}>
          {o.toCollect > 0 ? (
            <>
              <Text v="small" muted>{t('drvToCollect')}{o.paymentTerms ? ` · ${terms(o.paymentTerms)}` : ''}</Text>
              <Text v="title">{som(o.toCollect, locale)}</Text>
            </>
          ) : (
            <Text muted>✓ {t('drvNoCollect')}</Text>
          )}
          {d.cashCollected !== null && <Text v="small">💵 {t('drvCash')}: {som(d.cashCollected, locale)} — {t('drvCashHint')}</Text>}
        </Card>

        {d.status === 'DELIVERED' && (
          <Card style={{ gap: 2, backgroundColor: colors.successSoft, borderColor: colors.successSoft }}>
            <Text>{t('drvReceiver')}: <Text bold>{d.receiverName}</Text></Text>
            <Text v="caption">{dateTime(d.deliveredAt)}</Text>
          </Card>
        )}

        <View style={{ gap: space(2) }}>
          <Text v="small" bold>{t('drvItems')} ({o.itemsCount}) · {o.totalWeightKg} kg</Text>
          <Card style={{ paddingVertical: space(1) }}>
            {o.items?.map((i, idx) => (
              <View key={i.id}>
                {idx > 0 && <Divider />}
                <Row style={{ justifyContent: 'space-between', paddingVertical: space(2), alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text v="small">{name(i)}</Text>
                    <Text v="caption">{i.sku}{Object.values(i.attributes).length ? ` · ${Object.values(i.attributes).join(', ')}` : ''}</Text>
                  </View>
                  <Text bold>{i.qty} {unit(i.unit)}</Text>
                </Row>
              </View>
            ))}
          </Card>
        </View>
      </ScrollView>

      <Actions
        status={o.status}
        starting={start.isPending}
        onStart={() => start.mutate(undefined)}
        onDeliver={() => router.push({ pathname: '/driver/deliver', params: { id } })}
        onFail={() => router.push({ pathname: '/driver/fail', params: { id } })}
      />
    </View>
  );
}

function Actions(props: { status: string; starting: boolean; onStart: () => void; onDeliver: () => void; onFail: () => void }) {
  const { t } = useI18n();
  // Telefonda to'liq kenglik, keng ekranda markazdagi kontent bilan bir chiziqda
  const bar = { padding: space(4), borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card };
  const inner = { ...contained(CONTENT.page), gap: space(2) };
  if (props.status === 'READY') {
    return (
      <View style={bar}>
        <View style={inner}>
          <Button title={t('drvStart')} icon="car-outline" loading={props.starting} onPress={props.onStart} />
        </View>
      </View>
    );
  }
  if (props.status === 'OUT_FOR_DELIVERY') {
    return (
      <View style={bar}>
        <View style={inner}>
          <Button title={t('drvDeliver')} icon="checkmark-circle-outline" onPress={props.onDeliver} />
          <Button title={t('drvFail')} icon="close-circle-outline" variant="secondary" onPress={props.onFail} />
        </View>
      </View>
    );
  }
  if (props.status === 'CONFIRMED' || props.status === 'PREPARING') {
    return (
      <View style={bar}>
        <View style={inner}>
          <Text muted style={{ textAlign: 'center' }}>⏳ {t('drvNotReady')}</Text>
        </View>
      </View>
    );
  }
  return null;
}
