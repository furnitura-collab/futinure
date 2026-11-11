import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Card, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useActiveOrders } from '@/lib/orders';
import type { Balance } from '@/lib/types';
import { space, toneColors, useTheme, type Tone } from '@/theme';

interface Action {
  key: string;
  tone: Tone;
  title: string;
  text: string;
  button: string;
  onPress: () => void;
}

const openOrder = (id: string) => router.push({ pathname: '/order/[id]', params: { id } });

/** "Sizdan kutilmoqda" — taklif, to'lov, yangi xabar. Hech narsa bo'lmasa — umuman ko'rinmaydi */
export function ActionCards() {
  const { t, money } = useI18n();
  const { colors } = useTheme();
  const orders = useActiveOrders();
  const balance = useQuery({ queryKey: ['balance'], queryFn: () => api<Balance>('/me/balance') });

  const actions: Action[] = [];
  if (balance.data && balance.data.overdueAmount > 0) {
    actions.push({
      key: 'overdue',
      tone: 'destructive',
      title: t('actOverdueTitle', { amount: money(balance.data.overdueAmount) }),
      text: t('actOverdueText'),
      button: t('payNow'),
      onPress: () => router.push('/pay'),
    });
  }
  for (const o of orders.data?.items ?? []) {
    if (o.hasPendingQuote) {
      actions.push({ key: `q${o.id}`, tone: 'violet', title: t('actQuoteTitle', { number: o.number }), text: t('actQuoteText'), button: t('reviewQuote'), onPress: () => openOrder(o.id) });
    } else if (o.amountDue > 0) {
      actions.push({
        key: `p${o.id}`,
        tone: 'warning',
        title: t('actPayTitle', { amount: money(o.amountDue) }),
        text: t('actPayText', { number: o.number }),
        button: t('payNow'),
        onPress: () => router.push({ pathname: '/pay', params: { orderId: o.id } }),
      });
    }
    if (o.unreadMessages > 0) {
      actions.push({
        key: `m${o.id}`,
        tone: 'info',
        title: t('actMessageTitle', { n: o.unreadMessages }),
        text: t('actMessageText', { number: o.number }),
        button: t('openChat'),
        onPress: () => router.push({ pathname: '/order/[id]/chat', params: { id: o.id } }),
      });
    }
  }
  if (!actions.length) return null;

  return (
    <View style={{ gap: space(3) }}>
      <Text v="h2">{t('needsAction')}</Text>
      {actions.map((a) => {
        const tc = toneColors(colors, a.tone);
        return (
          <Card key={a.key} style={{ gap: space(3), borderLeftWidth: 4, borderLeftColor: tc.fg }}>
            <View style={{ flexDirection: 'row', gap: space(3), alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text bold>{a.title}</Text>
                <Text v="small" muted>{a.text}</Text>
              </View>
            </View>
            <Button title={a.button} size="md" variant={a.tone === 'info' ? 'outline' : 'primary'} onPress={a.onPress} />
          </Card>
        );
      })}
    </View>
  );
}
