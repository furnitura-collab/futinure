import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { Badge, Card, Empty, ErrorView, Ionicons, Loader, Row, Segmented, Text } from '../../components/ui';
import { api } from '../../lib/api';
import { STATUS_TONE } from '../../lib/catalog';
import { date, som } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { colors, space } from '../../lib/theme';
import type { OrderListItem, Paginated } from '../../lib/types';

export default function Orders() {
  const { t, status, locale } = useI18n();
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const q = useInfiniteQuery({
    queryKey: ['orders', 'list', tab],
    queryFn: ({ pageParam }) => api<Paginated<OrderListItem>>('/orders', { query: { active: tab === 'active', page: pageParam, limit: 20 } }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: space(4), paddingBottom: 0 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'active', label: t('active') }, { value: 'history', label: t('history') }]} />
      </View>
      {q.isPending ? (
        <Loader />
      ) : q.error ? (
        <ErrorView error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: space(4), gap: space(3) }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
          onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
          ListEmptyComponent={<Empty icon="receipt-outline" title={t('noOrders')} />}
          renderItem={({ item: o }) => (
            <Card onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })} style={{ gap: space(2) }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text bold>{o.number}</Text>
                <Text v="caption">{date(o.createdAt)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Badge label={status(o.status)} tone={STATUS_TONE[o.status]} />
                <Text bold>{som(o.grandTotal, locale)}</Text>
              </Row>
              {(o.hasPendingQuote || o.unreadMessages > 0) && (
                <Row>
                  {o.hasPendingQuote && <Badge label={`● ${t('quoteWaiting')}`} tone="violet" />}
                  {o.unreadMessages > 0 && (
                    <Row gap={4}>
                      <Ionicons name="chatbubble" size={14} color={colors.brand} />
                      <Text v="caption" color={colors.brand}>{o.unreadMessages}</Text>
                    </Row>
                  )}
                </Row>
              )}
            </Card>
          )}
        />
      )}
    </View>
  );
}
