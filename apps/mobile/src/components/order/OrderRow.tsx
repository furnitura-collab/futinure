import { router } from 'expo-router';
import { View } from 'react-native';
import { formatDate } from '@mebel/shared';
import { Badge, Icon, PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { STATUS_TONE } from '@/lib/catalog';
import { useLayout } from '@/lib/layout';
import { orderAction, statusSentenceKey } from '@/lib/orders';
import type { OrderListItem } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';
import { StageProgress } from './StageProgress';

/** Saytdagi buyurtmalar jadvali qatori: raqam/sana · tovarlar · holat · progress · summa va harakat */
export function OrderRow({ o }: { o: OrderListItem }) {
  const { t, status, money, name } = useI18n();
  const { colors, shadow } = useTheme();
  const { desktop } = useLayout();
  const action = orderAction(o);
  const more = o.itemsCount - o.preview.length;
  const items = o.preview.map((i) => name(i)).join(', ') + (more > 0 ? ` ${t('moreItems', { n: more })}` : '');

  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
      scale={0.995}
      accessibilityRole="link"
      accessibilityLabel={`${o.number}, ${status(o.status)}`}
      hoverStyle={{ backgroundColor: colors.muted }}
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: space(5), paddingVertical: space(4), paddingHorizontal: space(5), borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
        shadow,
      ]}
    >
      <View style={{ width: 150, gap: 2 }}>
        <Text bold numberOfLines={1}>{o.number}</Text>
        <Text v="caption">{formatDate(o.createdAt)}</Text>
      </View>
      <Text v="small" numberOfLines={2} style={{ flex: 2, minWidth: 0 }}>{items}</Text>
      <View style={{ flex: 2, minWidth: 0, gap: space(1) }}>
        <Badge label={status(o.status)} tone={STATUS_TONE[o.status]} dot />
        <Text v="caption" numberOfLines={2}>{t(statusSentenceKey(o.status, o.deliveryType, o.amountDue), { amount: money(o.amountDue) })}</Text>
      </View>
      {desktop && (
        <View style={{ width: 140 }}>
          <StageProgress status={o.status} />
        </View>
      )}
      <View style={{ width: desktop ? 240 : 180, alignItems: 'flex-end', gap: space(1) }}>
        <Text v="h2" numberOfLines={1}>{money(o.grandTotal)}</Text>
        {action === 'quote' && <Badge tone="violet" icon="sparkles" label={t('pillQuote')} />}
        {action === 'pay' && <Badge tone="warning" icon="card" label={t('pillPay', { amount: money(o.amountDue) })} />}
        {action === 'chat' && <Badge tone="info" icon="chatbubble" label={t('actMessageTitle', { n: o.unreadMessages })} />}
      </View>
      <Icon name="chevron-forward" size={18} color={colors.placeholder} />
    </PressableScale>
  );
}
