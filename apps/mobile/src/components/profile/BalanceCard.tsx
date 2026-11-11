import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Card, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { Balance } from '@/lib/types';
import { space, useTheme } from '@/theme';

/**
 * Pul holati oddiy so'zlar bilan (buxgalteriya atamalarisiz):
 * balans > 0 — mijoz qarzdor, < 0 — oldindan to'lagan.
 */
export function BalanceCard({ b, history = true, children }: { b: Balance; history?: boolean; children?: ReactNode }) {
  const { t, money } = useI18n();
  const { colors } = useTheme();
  const debt = b.balance > 0;
  const tone = debt ? 'destructive' : 'success';

  return (
    <Card style={{ gap: space(3) }}>
      <View style={{ gap: 2 }}>
        <Text v="small" muted>{debt ? t('yourDebt') : b.balance < 0 ? t('yourPrepaid') : t('balanceTitle')}</Text>
        <Text v="title" tone={tone}>{b.balance === 0 ? t('noDebt') : money(Math.abs(b.balance))}</Text>
      </View>
      {b.overdueAmount > 0 && (
        <Row gap={space(2)} style={{ alignItems: 'flex-start' }}>
          <Text v="small" bold tone="destructive" style={{ flex: 1 }}>{t('overdueLine', { amount: money(b.overdueAmount) })}</Text>
        </Row>
      )}
      {b.pendingPayments > 0 && (
        <Row gap={space(2)} style={{ alignItems: 'flex-start' }}>
          <Text v="small" style={{ flex: 1 }}>{t('pendingPayments', { amount: money(b.pendingPayments) })}</Text>
        </Row>
      )}
      {b.creditLimit > 0 && (
        <View style={{ gap: 2, paddingTop: space(3), borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text v="small" bold>{t('creditLimitLine', { amount: money(b.creditLimit) })}</Text>
          <Text v="caption">{t('creditLimitHint')}</Text>
          <Text v="caption">{t('creditAvailable', { amount: money(Math.max(0, b.availableCredit)) })}</Text>
        </View>
      )}
      {children}
      {history && <Button title={t('paymentsHistory')} variant="ghost" size="sm" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => router.push('/balance')} />}
    </Card>
  );
}
