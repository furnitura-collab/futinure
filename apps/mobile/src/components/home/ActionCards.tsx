import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Card, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { onlineMethods, payActionKey, useActiveOrders } from '@/lib/orders';
import { space, toneColors, useTheme, type Tone } from '@/theme';

interface Action {
  key: string;
  tone: Tone;
  title: string;
  text: string;
  /** Yo'q bo'lsa — faqat ma'lumot (masalan, naqd to'lov) */
  button?: { title: string; onPress: () => void };
}

/** "Sizdan kutilmoqda" — to'lov, yangi xabar. Hech narsa bo'lmasa — umuman ko'rinmaydi */
export function ActionCards({ columns = 1 }: { columns?: number }) {
  const { t, money } = useI18n();
  const { colors } = useTheme();
  const orders = useActiveOrders();

  const actions: Action[] = [];
  for (const o of orders.data?.items ?? []) {
    if (o.amountDue > 0) {
      // Faqat naqd bo'lsa — to'lov tugmasi yo'q, qayerda to'lanishi yoziladi
      const online = onlineMethods(o.allowedMethods).length > 0;
      actions.push({
        key: `p${o.id}`,
        tone: 'warning',
        title: t('actPayTitle', { amount: money(o.amountDue) }),
        text: t(payActionKey(o, online), { number: o.number }),
        button: online ? { title: t('payNow'), onPress: () => router.push({ pathname: '/pay', params: { orderId: o.id } }) } : undefined,
      });
    }
    if (o.unreadMessages > 0) {
      actions.push({
        key: `m${o.id}`,
        tone: 'info',
        title: t('actMessageTitle', { n: o.unreadMessages }),
        text: t('actMessageText', { number: o.number }),
        button: { title: t('openChat'), onPress: () => router.push({ pathname: '/order/[id]/chat', params: { id: o.id } }) },
      });
    }
  }
  if (!actions.length) return null;

  return (
    <View style={{ gap: space(3) }}>
      <Text v="h2">{t('needsAction')}</Text>
      {/* Har harakat — ixcham qator: matn chapda, tugma o'ngda; saytda bir nechta ustun */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
        {actions.map((a) => {
          const tc = toneColors(colors, a.tone);
          return (
            <Card
              key={a.key}
              style={{ flexGrow: 1, flexBasis: columns > 1 ? 300 : '100%', flexDirection: 'row', alignItems: 'center', gap: space(3), borderLeftWidth: 3, borderLeftColor: tc.fg }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text bold numberOfLines={2}>{a.title}</Text>
                <Text v="small" muted numberOfLines={2}>{a.text}</Text>
              </View>
              {a.button && <Button title={a.button.title} size="sm" variant={a.tone === 'info' ? 'outline' : 'primary'} onPress={a.button.onPress} />}
            </Card>
          );
        })}
      </View>
    </View>
  );
}
