import { router } from 'expo-router';
import { View } from 'react-native';
import { formatDate } from '@mebel/shared';
import { Badge, Icon, PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { STATUS_TONE } from '@/lib/catalog';
import { useLayout } from '@/lib/layout';
import type { OrderListItem } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';
import { OrderSignals, useItemsLine } from './OrderSignals';
import { StageProgress } from './OrderStepper';

/** Saytdagi buyurtmalar jadvali qatori: raqam/sana · tovarlar · holat · progress · summa va harakat */
export function OrderRow({ o }: { o: OrderListItem }) {
  const { status, money } = useI18n();
  const { colors } = useTheme();
  const { desktop } = useLayout();
  const items = useItemsLine(o);

  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
      scale={0.995}
      accessibilityRole="link"
      accessibilityLabel={`${o.number}, ${status(o.status)}`}
      hoverStyle={{ backgroundColor: colors.muted }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space(5),
        paddingVertical: space(3),
        paddingHorizontal: space(4),
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <View style={{ width: 140, gap: 2 }}>
        <Text bold numberOfLines={1}>{o.number}</Text>
        <Text v="caption">{formatDate(o.createdAt)}</Text>
      </View>
      <Text v="small" numberOfLines={1} style={{ flex: 2, minWidth: 0 }}>{items}</Text>
      <View style={{ width: 170 }}>
        <Badge label={status(o.status)} tone={STATUS_TONE[o.status]} dot />
      </View>
      {desktop && (
        <View style={{ width: 120 }}>
          <StageProgress status={o.status} />
        </View>
      )}
      <View style={{ width: desktop ? 220 : 170, alignItems: 'flex-end', gap: space(1) }}>
        <Text bold numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{money(o.grandTotal)}</Text>
        <OrderSignals o={o} />
      </View>
      <Icon name="caret-right" size={18} color={colors.placeholder} />
    </PressableScale>
  );
}
