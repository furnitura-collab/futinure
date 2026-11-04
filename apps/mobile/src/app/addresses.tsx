import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, View } from 'react-native';
import { Appear, Button, Card, EmptyState, Icon, IconButton, Row, Screen, SkeletonList, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useSite } from '@/lib/layout';
import { useApiMutation } from '@/lib/mutation';
import type { Address } from '@/lib/types';
import { space } from '@/theme';

export default function Addresses() {
  const { t } = useI18n();
  const { site } = useSite();
  const q = useQuery({ queryKey: ['addresses'], queryFn: () => api<Address[]>('/addresses') });
  const remove = useApiMutation((id: string) => api(`/addresses/${id}`, { method: 'DELETE' }), { invalidate: [['addresses']] });

  const add = <Button title={t('addAddress')} icon="add" size={site ? 'md' : 'lg'} onPress={() => router.push('/address-new')} />;

  return (
    <Screen scroll={false} siteWidth="page" title={t('addresses')} crumbs={[{ label: t('tabProfile'), href: '/profile' }]} actions={site ? add : undefined} footer={site ? undefined : add}>
      {(insets) => (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ ...insets.container, paddingTop: insets.top + space(4), paddingBottom: insets.bottom + space(4), gap: space(3) }}
          ListHeaderComponent={insets.header}
          ListFooterComponent={insets.footer}
          ListEmptyComponent={q.isPending ? <SkeletonList count={3} /> : <EmptyState icon="location-outline" title={t('noAddresses')} hint={t('noAddressesHint')} />}
          renderItem={({ item: a, index }) => (
            <Appear index={index}>
              <Card style={{ padding: space(3) }}>
                <Row style={{ alignItems: 'flex-start' }} gap={space(3)}>
                  <Icon name="location" size={20} tone="primary" />
                  <View style={{ flex: 1, gap: 2 }}>
                    {a.label ? <Text bold>{a.label}</Text> : null}
                    <Text v="small">{a.addressText}</Text>
                    {a.floor !== null && (
                      <Text v="caption">
                        {t('floor')}: {a.floor}
                      </Text>
                    )}
                  </View>
                  <IconButton icon="trash-outline" label={t('remove')} tone="destructive" size={36} onPress={() => remove.mutate(a.id)} />
                </Row>
              </Card>
            </Appear>
          )}
        />
      )}
    </Screen>
  );
}
