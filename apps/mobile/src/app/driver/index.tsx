import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { RefreshControl, SectionList } from 'react-native';
import { DeliveryRow } from '@/components/driver/DeliveryRow';
import { Appear, EmptyState, ErrorState, IconButton, Screen, SkeletonList, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { contained, CONTENT } from '@/lib/layout';
import type { DriverList } from '@/lib/types';
import { space, useTheme } from '@/theme';

/** Haydovchi: faol yetkazishlar (sana bo'yicha) va bugun topshirilganlar */
export default function DriverHome() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { me } = useAuth();
  const q = useQuery({ queryKey: ['driver', 'list'], queryFn: () => api<DriverList>('/driver/deliveries') });
  const active = q.data?.active ?? [];
  const done = q.data?.done ?? [];
  const sections = [
    { key: 'active', title: `${t('drvActive')} · ${active.length}`, data: active },
    ...(done.length ? [{ key: 'done', title: `${t('drvDone')} · ${done.length}`, data: done }] : []),
  ];

  const header = (
    <Stack.Screen
      options={{
        title: me?.fullName ?? t('drvTitle'),
        headerRight: () => <IconButton icon="settings-outline" label={t('settings')} onPress={() => router.push('/settings')} />,
      }}
    />
  );

  if (!q.data) {
    return (
      <Screen>
        {header}
        {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : <SkeletonList count={3} lines={3} />}
      </Screen>
    );
  }
  const today = q.data.today;

  return (
    <Screen scroll={false}>
      {(insets) => (
        <>
          {header}
          <SectionList
            sections={sections}
            keyExtractor={(d) => d.id}
            contentContainerStyle={{ ...contained(CONTENT.page), paddingHorizontal: space(4), paddingTop: insets.top + space(4), paddingBottom: insets.bottom + space(6), gap: space(3) }}
            refreshControl={
              <RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primary} colors={[colors.primary]} progressViewOffset={insets.top} />
            }
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <Text v="caption" bold style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: section.key === 'done' ? space(4) : 0 }}>
                {section.title}
              </Text>
            )}
            renderSectionFooter={({ section }) =>
              section.key === 'active' && !active.length ? <EmptyState icon="car-outline" title={t('drvEmpty')} hint={t('drvEmptyHint')} /> : null
            }
            renderItem={({ item, index }) => (
              <Appear index={index}>
                <DeliveryRow d={item} today={today} />
              </Appear>
            )}
          />
        </>
      )}
    </Screen>
  );
}
