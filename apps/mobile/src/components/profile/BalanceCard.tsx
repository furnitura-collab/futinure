import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Card, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { Balance } from '@/lib/types';
import { space } from '@/theme';

/**
 * Pul holati oddiy so'zlar bilan (buxgalteriya atamalarisiz):
 * balans > 0 — mijoz qarzdor, < 0 — oldindan to'lagan.
 */
export function BalanceCard({ b, history = true, children }: { b: Balance; history?: boolean; children?: ReactNode }) {
  const { t, money } = useI18n();
  const debt = b.balance > 0;

  return (
    <Card style={{ gap: space(3) }}>
      <View style={{ gap: 2 }}>
        <Text v="small" muted>{debt ? t('yourDebt') : b.balance < 0 ? t('yourPrepaid') : t('balanceTitle')}</Text>
        <Text v="display" tone={debt ? 'destructive' : 'success'} style={{ fontVariant: ['tabular-nums'] }}>
          {b.balance === 0 ? t('noDebt') : money(Math.abs(b.balance))}
        </Text>
        {b.pendingPayments > 0 && <Text v="small" muted>{t('pendingPayments', { amount: money(b.pendingPayments) })}</Text>}
      </View>
      {children}
      {history && <Button title={t('paymentsHistory')} variant="ghost" size="sm" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => router.push('/balance')} />}
    </Card>
  );
}
