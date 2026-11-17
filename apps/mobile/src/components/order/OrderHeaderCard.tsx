import { router } from 'expo-router';
import { View } from 'react-native';
import { formatDate } from '@mebel/shared';
import { Button, Card, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { orderAction, statusSentenceKey } from '@/lib/orders';
import type { OrderDetail } from '@/lib/types';
import { space, useTheme } from '@/theme';
import { OrderStepper } from './OrderStepper';

/** Buyurtma "yuragi": keyingi qadam bir jumlada, bosqichlar va (kerak bo'lsa) to'lanadigan summa bilan to'lov */
export function OrderHeaderCard({ o }: { o: OrderDetail }) {
  const { t, money } = useI18n();
  const { colors } = useTheme();
  const pay = orderAction(o) === 'pay';
  return (
    <Card style={{ gap: space(4) }}>
      <View style={{ gap: space(1) }}>
        <Text v="h2">{t(statusSentenceKey(o.status, o.deliveryType, o.amountDue), { amount: money(o.amountDue) })}</Text>
        {o.deliveryDate && o.status !== 'CANCELLED' ? <Text v="small" muted>{t('plannedDate', { date: formatDate(o.deliveryDate) })}</Text> : null}
      </View>
      <OrderStepper o={o} />
      {pay && (
        <View style={{ gap: space(3), paddingTop: space(4), borderTopWidth: 1, borderTopColor: colors.border }}>
          <View style={{ gap: 2 }}>
            <Text v="small" muted>{t('toPayNow')}</Text>
            <Text v="title" style={{ fontVariant: ['tabular-nums'] }}>{money(o.amountDue)}</Text>
          </View>
          <Button title={t('payNow')} block onPress={() => router.push({ pathname: '/pay', params: { orderId: o.id } })} />
        </View>
      )}
    </Card>
  );
}
