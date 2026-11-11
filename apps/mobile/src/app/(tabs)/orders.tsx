import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { OrderCard } from '@/components/order/OrderCard';
import { OrderRow } from '@/components/order/OrderRow';
import { Appear, Button, EmptyState, ErrorState, Screen, Segmented, SkeletonList } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useSite } from '@/lib/layout';
import { usePaginated } from '@/lib/query';
import type { OrderListItem } from '@/lib/types';
import { space, useTheme } from '@/theme';

export default function Orders() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { site } = useSite();
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const q = usePaginated<OrderListItem>(['orders', 'list', tab], '/orders', { query: { active: tab === 'active' } });
  const tabs = <Segmented value={tab} onChange={setTab} options={[{ value: 'active', label: t('active') }, { value: 'history', label: t('history') }]} />;

  return (
    // Saytda Faol/Tarix — sahifa sarlavhasida, ro'yxat — jadval qatorlari
    <Screen scroll={false} title={t('tabOrders')} actions={<View style={{ width: 240 }}>{tabs}</View>}>
      {(insets) => (
        <FlatList
          data={q.items}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ ...insets.container, paddingTop: insets.top + space(site ? 6 : 4), paddingBottom: insets.bottom + space(6), gap: space(3) }}
          refreshControl={
            <RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} tintColor={colors.primary} colors={[colors.primary]} progressViewOffset={insets.top} />
          }
          onEndReached={q.loadMore}
          ListHeaderComponent={insets.header ?? <View style={{ marginBottom: space(1) }}>{tabs}</View>}
          ListFooterComponent={insets.footer}
          ListEmptyComponent={
            q.isPending ? (
              <SkeletonList count={4} />
            ) : q.error ? (
              <ErrorState error={q.error} onRetry={() => void q.refetch()} />
            ) : (
              <EmptyState
                icon="receipt-outline"
                title={tab === 'active' ? t('noActiveOrders') : t('noOrders')}
                hint={t('noOrdersHint')}
                action={<Button title={t('goToCatalog')} variant="outline" size="md" onPress={() => router.navigate('/catalog')} />}
              />
            )
          }
          renderItem={({ item, index }) => <Appear index={index}>{site ? <OrderRow o={item} /> : <OrderCard o={item} />}</Appear>}
        />
      )}
    </Screen>
  );
}
