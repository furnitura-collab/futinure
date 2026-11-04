import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, View } from 'react-native';
import { Button, Card, Empty, Loader, Row, Text } from '../components/ui';
import { api } from '../lib/api';
import { dateTime, som } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { colors, space } from '../lib/theme';
import type { Balance, LedgerEntry, Paginated } from '../lib/types';
import { contained, CONTENT } from '../lib/layout';

/** Hisob-kitob: balans va daftar yozuvlari; qarz bo'lsa — to'lash */
export default function BalanceScreen() {
  const { t, locale } = useI18n();
  const balance = useQuery({ queryKey: ['balance'], queryFn: () => api<Balance>('/me/balance') });
  const ledger = useInfiniteQuery({
    queryKey: ['ledger'],
    queryFn: ({ pageParam }) => api<Paginated<LedgerEntry>>('/me/ledger', { query: { page: pageParam, limit: 30 } }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
  if (balance.isPending || ledger.isPending) return <Loader />;
  const b = balance.data;
  const entries = ledger.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <FlatList
      data={entries}
      keyExtractor={(e) => e.id}
      contentContainerStyle={{ ...contained(CONTENT.page), padding: space(4), gap: space(2) }}
      onEndReached={() => ledger.hasNextPage && void ledger.fetchNextPage()}
      ListHeaderComponent={
        b ? (
          <Card style={{ gap: space(2), marginBottom: space(2) }}>
            <Text muted>{t('balance')}</Text>
            <Text v="title" color={b.balance > 0 ? colors.warning : b.balance < 0 ? colors.success : colors.text}>
              {b.balance > 0 ? `${t('debt')}: ${som(b.balance, locale)}` : b.balance < 0 ? `${t('credit')}: ${som(-b.balance, locale)}` : som(0, locale)}
            </Text>
            {b.overdueAmount > 0 && <Text bold color={colors.danger}>{t('overdue')}: {som(b.overdueAmount, locale)}</Text>}
            {b.pendingPayments > 0 && <Text v="small" muted>⏳ {som(b.pendingPayments, locale)}</Text>}
            {b.balance - b.pendingPayments > 0 && <Button title={t('payDebt')} icon="card-outline" onPress={() => router.push('/pay')} />}
          </Card>
        ) : undefined
      }
      ListEmptyComponent={<Empty icon="document-text-outline" title="—" />}
      renderItem={({ item: e }) => (
        <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: space(3), gap: 2, borderWidth: 1, borderColor: colors.border }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text v="small" style={{ flex: 1 }}>{e.description}</Text>
            <Text bold color={e.amount > 0 ? colors.warning : colors.success}>
              {e.amount > 0 ? '+' : '−'}
              {som(Math.abs(e.amount), locale)}
            </Text>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text v="caption">{dateTime(e.createdAt)}</Text>
            <Text v="caption">= {som(e.balanceAfter, locale)}</Text>
          </Row>
        </View>
      )}
    />
  );
}
