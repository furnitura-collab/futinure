import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Appear, Button, EmptyState, ErrorState, IconButton, ListGroup, ListItem, Screen, SkeletonList } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useSite } from '@/lib/layout';
import { useApiMutation } from '@/lib/mutation';
import type { Address } from '@/lib/types';

export default function Addresses() {
  const { t } = useI18n();
  const { site } = useSite();
  const q = useQuery({ queryKey: ['addresses'], queryFn: () => api<Address[]>('/addresses') });
  const remove = useApiMutation((id: string) => api(`/addresses/${id}`, { method: 'DELETE' }), { invalidate: [['addresses']] });

  const add = <Button title={t('addAddress')} size={site ? 'md' : 'lg'} onPress={() => router.push('/address-new')} />;
  const details = (a: Address) =>
    [a.label ? a.addressText : null, a.floor !== null ? `${t('floor')}: ${a.floor}` : null].filter(Boolean).join(' · ') || undefined;

  return (
    <Screen
      siteWidth="page"
      title={t('addresses')}
      crumbs={[{ label: t('tabProfile'), href: '/profile' }]}
      actions={site ? add : undefined}
      footer={site ? undefined : add}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
    >
      {q.isPending ? (
        <SkeletonList count={3} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState icon="map-pin" title={t('noAddresses')} hint={t('noAddressesHint')} />
      ) : (
        <Appear>
          <ListGroup>
            {q.data.map((a) => (
              <ListItem
                titleLines={2}
                key={a.id}
                title={a.label ?? a.addressText}
                subtitle={details(a)}
                right={<IconButton icon="trash" label={t('remove')} tone="destructive" size={40} disabled={remove.isPending} onPress={() => remove.mutate(a.id)} />}
              />
            ))}
          </ListGroup>
        </Appear>
      )}
    </Screen>
  );
}
