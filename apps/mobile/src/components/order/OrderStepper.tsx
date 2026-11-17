import { View } from 'react-native';
import { CUSTOMER_STAGES, customerStage, formatDate, type OrderStatus } from '@mebel/shared';
import { Icon, Text } from '@/components/ui';
import { useI18n, type I18nKey } from '@/i18n';
import { stageKeys } from '@/lib/orders';
import type { OrderDetail } from '@/lib/types';
import { space, useTheme } from '@/theme';

type StepState = 'done' | 'current' | 'upcoming' | 'cancelled';
interface Step {
  label: string;
  state: StepState;
  time?: string;
}

const DOT = 28;
const GAP = 6;

/** Bosqichlar: bekor qilinganda — qayergacha yetgani va oxirida qizil "bekor qilindi" */
function buildSteps(o: Pick<OrderDetail, 'status' | 'deliveryType' | 'statusHistory'>, label: (k: I18nKey) => string): Step[] {
  const cancelled = o.status === 'CANCELLED';
  const reached = cancelled ? Math.max(-1, ...o.statusHistory.map((h) => customerStage(h.toStatus))) : customerStage(o.status);
  const at = (i: number) => o.statusHistory.find((h) => customerStage(h.toStatus) >= i)?.createdAt;
  const steps: Step[] = stageKeys(o.deliveryType).map((key, i) => ({
    label: label(key),
    time: at(i),
    // Oxirgi bosqich (topshirildi) — yakun, "joriy" emas
    state: i < reached || (i === reached && (cancelled || i === CUSTOMER_STAGES.length - 1)) ? 'done' : i === reached ? 'current' : 'upcoming',
  }));
  if (!cancelled) return steps;
  return [...steps.filter((s) => s.state === 'done'), { label: label('stageCancelled'), state: 'cancelled', time: o.statusHistory.at(-1)?.createdAt }];
}

function Dot({ n, state }: { n: number; state: StepState }) {
  const { colors } = useTheme();
  const filled = state === 'done' || state === 'cancelled';
  const color = state === 'cancelled' ? colors.destructive : state === 'upcoming' ? colors.input : colors.primary;
  return (
    <View
      style={{
        width: DOT,
        height: DOT,
        borderRadius: DOT / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? color : state === 'current' ? colors.primarySoft : colors.card,
        borderWidth: 2,
        borderColor: color,
        // Joriy bosqich — yumshoq halqa
        ...(state === 'current' ? { boxShadow: `0 0 0 4px ${colors.ring}` } : null),
      }}
    >
      {filled ? (
        <Icon name={state === 'cancelled' ? 'x' : 'check'} size={14} color={colors.primaryForeground} />
      ) : (
        <Text v="caption" bold color={state === 'current' ? colors.primary : colors.mutedForeground}>{n}</Text>
      )}
    </View>
  );
}

/** Buyurtma bosqichlari: o'tgan — to'ldirilgan va belgi, joriy — halqa va raqam, keyingi — chiziqli raqam */
export function OrderStepper({ o }: { o: Pick<OrderDetail, 'status' | 'deliveryType' | 'statusHistory' | 'cancelReason'> }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const steps = buildSteps(o, t);

  return (
    <View style={{ gap: space(3) }}>
      <View accessibilityRole="list" style={{ flexDirection: 'row' }}>
        {steps.map((s, i) => {
          const reachedHere = s.state !== 'upcoming';
          return (
            <View
              key={s.label}
              accessibilityLabel={`${i + 1}. ${s.label}${s.time && reachedHere ? `, ${formatDate(s.time)}` : ''}`}
              style={{ flex: 1, alignItems: 'center', gap: space(2) }}
            >
              {i > 0 && (
                // Oldingi doira markazidan shu doiragacha bitta chiziq; doiralarga tegmaydi (GAP)
                <View
                  style={{
                    position: 'absolute',
                    top: DOT / 2 - 1,
                    left: '-50%',
                    right: '50%',
                    marginLeft: DOT / 2 + GAP,
                    marginRight: DOT / 2 + GAP,
                    height: 2,
                    borderRadius: 1,
                    backgroundColor: reachedHere ? colors.primary : colors.border,
                  }}
                />
              )}
              <Dot n={i + 1} state={s.state} />
              {/* Telefonda ustun ~80px: uzun so'z ("Tayyorlanmoqda") bo'linmasligi uchun yorliq ustundan biroz keng */}
              <View style={{ alignSelf: 'stretch', alignItems: 'center', gap: 2, marginHorizontal: -GAP }}>
                <Text
                  v="caption"
                  center
                  numberOfLines={2}
                  style={{ fontSize: 11, lineHeight: 14 }}
                  bold={s.state === 'current' || s.state === 'cancelled'}
                  tone={s.state === 'cancelled' ? 'destructive' : undefined}
                  color={s.state === 'current' ? colors.foreground : undefined}
                >
                  {s.label}
                </Text>
                {s.time && (s.state === 'current' || s.state === 'cancelled') ? <Text v="caption" center style={{ fontSize: 11, lineHeight: 14 }}>{formatDate(s.time)}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
      {o.status === 'CANCELLED' && o.cancelReason ? <Text v="small" muted>{o.cancelReason}</Text> : null}
    </View>
  );
}

/** Ro'yxat kartalari uchun ixcham variant: 4 bo'lakli chiziq */
export function StageProgress({ status }: { status: OrderStatus }) {
  const { colors } = useTheme();
  const stage = customerStage(status);
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: CUSTOMER_STAGES.length, now: stage + 1 }}>
      {CUSTOMER_STAGES.map((s, i) => (
        <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: stage < 0 ? colors.destructiveSoft : i <= stage ? colors.primary : colors.muted }} />
      ))}
    </View>
  );
}
