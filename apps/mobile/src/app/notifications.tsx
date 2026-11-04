import { router, Stack } from 'expo-router';
import { FlatList, RefreshControl, View } from 'react-native';
import { formatDateTime } from '@mebel/shared';
import { Appear, Button, Card, EmptyState, Row, Screen, SkeletonList, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { usePaginated } from '@/lib/query';
import type { Notification } from '@/lib/types';
import { space, useTheme } from '@/theme';

export default function Notifications() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const q = usePaginated<Notification, { unread: number }>(['notifications'], '/notifications', { limit: 30 });
  const readAll = useApiMutation(() => api('/notifications/read', { body: { all: true } }), { invalidate: [['notifications']] });
  const readOne = useApiMutation((id: string) => api('/notifications/read', { body: { ids: [id] } }), { invalidate: [['notifications']] });
  const unread = q.data?.pages[0]?.unread ?? 0;
  const markAll = unread ? <Button title={t('markAllRead')} variant="ghost" size="sm" onPress={() => readAll.mutate(undefined)} /> : null;

  return (
    <Screen scroll={false} siteWidth="page" title={t('notifications')} actions={markAll}>
      {(insets) => (
        <>
          <Stack.Screen
            options={{
              headerRight: () => markAll,
            }}
          />
          <FlatList
            data={q.items}
            keyExtractor={(n) => n.id}
            contentContainerStyle={{ ...insets.container, paddingTop: insets.top + space(4), paddingBottom: insets.bottom + space(6), gap: space(2) }}
            onEndReached={q.loadMore}
            refreshControl={
              <RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} tintColor={colors.primary} colors={[colors.primary]} progressViewOffset={insets.top} />
            }
            ListHeaderComponent={insets.header}
            ListFooterComponent={insets.footer}
            ListEmptyComponent={
              q.isPending ? <SkeletonList count={4} /> : <EmptyState icon="notifications-off-outline" title={t('noNotifications')} hint={t('noNotificationsHint')} />
            }
            renderItem={({ item: n, index }) => (
              <Appear index={index}>
                <Card
                  tone={n.readAt ? undefined : 'primary'}
                  accessibilityLabel={n.title}
                  onPress={() => {
                    if (!n.readAt) readOne.mutate(n.id);
                    if (n.payload.orderId) router.push({ pathname: '/order/[id]', params: { id: n.payload.orderId } });
                  }}
                  style={{ gap: space(1), padding: space(3) }}
                >
                  <Row between style={{ alignItems: 'flex-start' }}>
                    <Row gap={6} style={{ flex: 1 }}>
                      {!n.readAt && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />}
                      <Text bold style={{ flex: 1 }}>{n.title}</Text>
                    </Row>
                    <Text v="caption">{formatDateTime(n.createdAt)}</Text>
                  </Row>
                  <Text v="small">{n.body}</Text>
                </Card>
              </Appear>
            )}
          />
        </>
      )}
    </Screen>
  );
}
