import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { StageProgress } from '@/components/order/StageProgress';
import { Badge, Card, SectionHeader, Text } from '@/components/ui';
import { Grid } from '@/components/web/Grid';
import { useI18n } from '@/i18n';
import { STATUS_TONE } from '@/lib/catalog';
import { useLayout, useSite } from '@/lib/layout';
import { statusSentenceKey, useActiveOrders } from '@/lib/orders';
import type { OrderListItem } from '@/lib/types';
import { space } from '@/theme';

/** Faol buyurtmalar — gorizontal kartalar (saytda — 3 ustunli to'r): holat, "keyin nima" va mini progress */
export function ActiveOrdersRail() {
  const { t } = useI18n();
  const { site } = useSite();
  const { desktop } = useLayout();
  const orders = useActiveOrders();
  const items = orders.data?.items ?? [];
  if (!items.length) return null;

  return (
    <View style={{ gap: space(3) }}>
      <SectionHeader title={t('activeOrders')} action={t('seeAll')} onAction={() => router.navigate('/orders')} />
      {site ? (
        <Grid columns={desktop ? 3 : 2} gap={space(4)}>
          {items.slice(0, 6).map((o) => (
            <ActiveOrderCard key={o.id} o={o} />
          ))}
        </Grid>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space(4) }} contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4), paddingBottom: space(1) }}>
          {items.map((o) => (
            <ActiveOrderCard key={o.id} o={o} width={272} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function ActiveOrderCard({ o, width }: { o: OrderListItem; width?: number }) {
  const { t, status, money } = useI18n();
  return (
    <Card onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })} accessibilityLabel={`${o.number}, ${status(o.status)}`} style={{ width, gap: space(2) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space(2) }}>
        <Badge label={status(o.status)} tone={STATUS_TONE[o.status]} dot />
        <Text v="caption">{o.number}</Text>
      </View>
      <Text v="small" numberOfLines={2} style={{ minHeight: 36 }}>{t(statusSentenceKey(o.status, o.deliveryType, o.amountDue), { amount: money(o.amountDue) })}</Text>
      <StageProgress status={o.status} />
      <Text bold>{money(o.grandTotal)}</Text>
    </Card>
  );
}
