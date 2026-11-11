import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, View } from 'react-native';
import { formatDateTime } from '@mebel/shared';
import { BalanceCard } from '@/components/profile/BalanceCard';
import { Appear, Button, Card, EmptyState, Row, Screen, Skeleton, SkeletonList, Text } from '@/components/ui';
import { useI18n, type I18nKey } from '@/i18n';
import { api } from '@/lib/api';
import { usePaginated } from '@/lib/query';
import type { Balance, LedgerEntry } from '@/lib/types';
import { radius, space, toneColors, useTheme } from '@/theme';

/** Yozuv turi mijoz tilida: qarzga yozildi / to'lov qabul qilindi / tuzatish / qaytarildi */
const ENTRY: Record<LedgerEntry['type'], I18nKey> = {
  DEBIT: 'entryDebit',
  CREDIT: 'entryCredit',
  ADJUSTMENT: 'entryAdjustment',
  REFUND: 'entryRefund',
};

/** To'lovlar tarixi: holat kartasi va har bir yozuv; qarz bo'lsa — to'lash */
export default function BalanceScreen() {
  const { t, money } = useI18n();
  const { colors } = useTheme();
  const balance = useQuery({ queryKey: ['balance'], queryFn: () => api<Balance>('/me/balance') });
  const ledger = usePaginated<LedgerEntry>(['ledger'], '/me/ledger', { limit: 30 });
  const b = balance.data;

  return (
    <Screen scroll={false} siteWidth="page" title={t('paymentsHistory')} crumbs={[{ label: t('tabProfile'), href: '/profile' }]}>
      {(insets) => (
        <FlatList
          data={ledger.items}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ ...insets.container, paddingTop: insets.top + space(4), paddingBottom: insets.bottom + space(6), gap: space(2) }}
          onEndReached={ledger.loadMore}
          ListHeaderComponent={
            <View style={{ marginBottom: space(3), gap: space(4) }}>
              {insets.header}
              {b ? (
                <BalanceCard b={b} history={false}>
                  {b.balance - b.pendingPayments > 0 && <Button title={t('payDebt')} size="md" onPress={() => router.push('/pay')} />}
                </BalanceCard>
              ) : (
                <Skeleton height={120} radius={radius.lg} />
              )}
              <Text v="h2">{t('historyTitle')}</Text>
            </View>
          }
          ListFooterComponent={insets.footer}
          ListEmptyComponent={ledger.isPending ? <SkeletonList count={4} lines={1} /> : <EmptyState icon="document-text-outline" title={t('ledgerEmpty')} />}
          renderItem={({ item: e, index }) => {
            const debit = e.amount > 0;
            const tc = toneColors(colors, debit ? 'warning' : 'success');
            return (
              <Appear index={index}>
                <Card style={{ padding: space(3) }}>
                  <Row gap={space(3)} style={{ alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text v="small" bold>{t(ENTRY[e.type])}</Text>
                      <Text v="caption">{e.order ? `${e.order.number} · ` : ''}{formatDateTime(e.createdAt)}</Text>
                      {e.description ? <Text v="caption" numberOfLines={2}>{e.description}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text bold color={tc.fg}>
                        {debit ? '+' : '−'}
                        {money(Math.abs(e.amount))}
                      </Text>
                      <Text v="caption">{e.balanceAfter > 0 ? t('debtAfter', { amount: money(e.balanceAfter) }) : t('noDebtAfter')}</Text>
                    </View>
                  </Row>
                </Card>
              </Appear>
            );
          }}
        />
      )}
    </Screen>
  );
}
