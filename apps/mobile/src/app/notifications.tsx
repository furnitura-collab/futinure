import { useInfiniteQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import { Empty, Loader, Text } from '../components/ui';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useApiMutation } from '../lib/mutation';
import { colors, radius, space } from '../lib/theme';
import type { Notification, Paginated } from '../lib/types';

export default function Notifications() {
  const { t } = useI18n();
  const q = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => api<Paginated<Notification> & { unread: number }>('/notifications', { query: { page: pageParam, limit: 30 } }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
  const readAll = useApiMutation(() => api('/notifications/read', { body: { all: true } }), { invalidate: [['notifications']] });
  const readOne = useApiMutation((id: string) => api('/notifications/read', { body: { ids: [id] } }), { invalidate: [['notifications']] });
  if (q.isPending) return <Loader />;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = q.data?.pages[0]?.unread ?? 0;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            unread ? (
              <Pressable onPress={() => readAll.mutate(undefined)} style={{ paddingHorizontal: space(3) }}>
                <Text v="small" color={colors.brand}>{t('markAllRead')}</Text>
              </Pressable>
            ) : null,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: space(4), gap: space(2) }}
        onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
        ListEmptyComponent={<Empty icon="notifications-off-outline" title={t('noNotifications')} />}
        renderItem={({ item: n }) => (
          <Pressable
            onPress={() => {
              if (!n.readAt) readOne.mutate(n.id);
              if (n.payload.orderId) router.push({ pathname: '/order/[id]', params: { id: n.payload.orderId } });
            }}
            style={{
              backgroundColor: n.readAt ? colors.card : colors.brandBg,
              borderRadius: radius.md,
              padding: space(3),
              borderWidth: 1,
              borderColor: n.readAt ? colors.border : colors.brandSoft,
              gap: 2,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text bold style={{ flex: 1 }}>{n.title}</Text>
              <Text v="caption">{dateTime(n.createdAt)}</Text>
            </View>
            <Text v="small">{n.body}</Text>
          </Pressable>
        )}
      />
    </>
  );
}
