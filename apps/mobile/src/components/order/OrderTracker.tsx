import { View } from 'react-native';
import { customerStage, formatDateTime } from '@mebel/shared';
import { Card, Icon, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { stageKeys } from '@/lib/orders';
import type { OrderDetail } from '@/lib/types';
import { space, useTheme } from '@/theme';

/** Vertikal kuzatuv: 5 bosqich, o'tganlari belgilangan va vaqti bilan; bekor qilingan — alohida qizil */
export function OrderTracker({ o }: { o: OrderDetail }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const cancelled = o.status === 'CANCELLED';
  // Bekor qilinganda — bekor qilishdan oldin qayergacha yetgani
  const reached = cancelled ? Math.max(0, ...o.statusHistory.map((h) => customerStage(h.toStatus))) : customerStage(o.status);
  const at = (i: number) => o.statusHistory.find((h) => customerStage(h.toStatus) >= i)?.createdAt;
  const stages = stageKeys(o.deliveryType).map((key, i) => ({ label: t(key), time: at(i), done: i <= reached, current: !cancelled && i === reached }));
  const rows = cancelled
    ? [...stages.filter((s) => s.done), { label: t('stageCancelled'), time: o.statusHistory.at(-1)?.createdAt, done: true, current: true }]
    : stages;

  return (
    <Card style={{ gap: space(3) }}>
      <Text v="h2">{t('trackTitle')}</Text>
      <View accessibilityRole="list">
        {rows.map((s, i) => {
          const last = i === rows.length - 1;
          const red = cancelled && last;
          const color = red ? colors.destructive : s.done ? colors.primary : colors.input;
          return (
            <View key={s.label} style={{ flexDirection: 'row', gap: space(3) }} accessibilityLabel={`${s.label}${s.time ? `, ${formatDateTime(s.time)}` : ''}`}>
              <View style={{ alignItems: 'center', width: 24 }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: s.done ? color : colors.card,
                    borderWidth: 2,
                    borderColor: color,
                  }}
                >
                  {s.done ? <Icon name={red ? 'close' : 'checkmark'} size={14} color={colors.primaryForeground} /> : null}
                </View>
                {!last && <View style={{ flex: 1, width: 2, minHeight: 20, backgroundColor: rows[i + 1]?.done ? colors.primary : colors.border }} />}
              </View>
              <View style={{ flex: 1, paddingBottom: last ? 0 : space(4), gap: 2, paddingTop: 2 }}>
                <Text bold={s.current} tone={red ? 'destructive' : undefined} muted={!s.done}>{s.label}</Text>
                {s.time && s.done ? <Text v="caption">{formatDateTime(s.time)}</Text> : null}
                {red && o.cancelReason ? <Text v="small" muted>{o.cancelReason}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
