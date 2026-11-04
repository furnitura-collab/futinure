import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import { Button, Empty, Ionicons, Loader, Row, Text } from '../components/ui';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useApiMutation } from '../lib/mutation';
import { colors, radius, space } from '../lib/theme';
import type { Address } from '../lib/types';
import { contained, CONTENT } from '../lib/layout';

export default function Addresses() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['addresses'], queryFn: () => api<Address[]>('/addresses') });
  const remove = useApiMutation((id: string) => api(`/addresses/${id}`, { method: 'DELETE' }), { invalidate: [['addresses']] });
  if (q.isPending) return <Loader />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={q.data ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ ...contained(CONTENT.page), padding: space(4), gap: space(2) }}
        ListEmptyComponent={<Empty icon="location-outline" title={t('addresses')} />}
        renderItem={({ item: a }) => (
          <Row style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: space(3), borderWidth: 1, borderColor: colors.border, alignItems: 'flex-start' }}>
            <Ionicons name="location" size={20} color={colors.brand} />
            <View style={{ flex: 1, gap: 2 }}>
              {a.label ? <Text bold>{a.label}</Text> : null}
              <Text v="small">{a.addressText}</Text>
              {a.floor !== null && <Text v="caption">{t('floor')}: {a.floor}</Text>}
            </View>
            <Pressable onPress={() => remove.mutate(a.id)} hitSlop={10}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
          </Row>
        )}
      />
      <View style={{ ...contained(CONTENT.page), padding: space(4) }}>
        <Button title={t('addAddress')} icon="add" onPress={() => router.push('/address-new')} />
      </View>
    </View>
  );
}
