import { router, Stack } from 'expo-router';
import { FlatList, RefreshControl, View } from 'react-native';
import { formatDateTime } from '@mebel/shared';
import { EmptyState, GroupedRow, IconButton, Row, Screen, SkeletonList, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { usePaginated } from '@/lib/query';
import type { Notification } from '@/lib/types';
import { space, useTheme } from '@/theme';

/** Bildirishnomalar: o'qilmagani — qalin sarlavha va to'q matn, o'qilgani — xira */
export default function Notifications() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const q = usePaginated<Notification, { unread: number }>(['notifications'], '/notifications', { limit: 30 });
  const readAll = useApiMutation(() => api('/notifications/read', { body: { all: true } }), { invalidate: [['notifications']] });
  const readOne = useApiMutation((id: string) => api('/notifications/read', { body: { ids: [id] } }), { invalidate: [['notifications']] });
  const unread = q.data?.pages[0]?.unread ?? 0;
  const count = q.items.length;
  const markAll = unread ? <IconButton icon="checks" label={t('markAllRead')} onPress={() => readAll.mutate(undefined)} /> : null;

  return (
    <Screen scroll={false} siteWidth="page" title={t('notifications')} actions={markAll}>
      {(insets) => (
        <>
          <Stack.Screen options={{ headerRight: () => markAll }} />
          <FlatList
            data={q.items}
            keyExtractor={(n) => n.id}
            contentContainerStyle={{ ...insets.container, paddingTop: insets.top + space(4), paddingBottom: insets.bottom + space(6) }}
            onEndReached={q.loadMore}
            refreshControl={
              <RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} tintColor={colors.primary} colors={[colors.primary]} progressViewOffset={insets.top} />
            }
            ListHeaderComponent={insets.header}
            ListFooterComponent={insets.footer}
            ListEmptyComponent={
              q.isPending ? <SkeletonList count={4} /> : <EmptyState icon="bell-slash" title={t('noNotifications')} hint={t('noNotificationsHint')} />
            }
            renderItem={({ item: n, index }) => {
              const fresh = !n.readAt;
              return (
                <GroupedRow
                  index={index}
                  count={count}
                  accessibilityLabel={n.title}
                  onPress={() => {
                    if (fresh) readOne.mutate(n.id);
                    if (n.payload.orderId) router.push({ pathname: '/order/[id]', params: { id: n.payload.orderId } });
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Row between gap={space(3)} style={{ alignItems: 'flex-start' }}>
                      <Text bold={fresh} color={fresh ? colors.foreground : colors.mutedForeground} style={{ flex: 1 }} numberOfLines={2}>
                        {n.title}
                      </Text>
                      <Text v="caption" tone={fresh ? 'primary' : undefined}>{formatDateTime(n.createdAt)}</Text>
                    </Row>
                    <Text v="small" muted={!fresh} numberOfLines={3}>{n.body}</Text>
                  </View>
                </GroupedRow>
              );
            }}
          />
        </>
      )}
    </Screen>
  );
}
