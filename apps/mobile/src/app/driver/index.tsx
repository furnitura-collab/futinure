import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { RefreshControl, SectionList } from 'react-native';
import { DeliveryRow } from '@/components/driver/DeliveryRow';
import { Appear, EmptyState, ErrorState, IconButton, Screen, SkeletonList, Text } from '@/components/ui';
import { useI18n, type I18nKey } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { driverSections, type DriverSection } from '@/lib/driver';
import { contained, CONTENT } from '@/lib/layout';
import type { DriverList } from '@/lib/types';
import { space, useTheme } from '@/theme';

const TITLES: Record<DriverSection['key'], I18nKey> = { today: 'drvToday', upcoming: 'drvUpcoming', done: 'drvDone' };

/** Haydovchi: bugungi yetkazishlar birinchi, keyin keyingi kunlar va bugun topshirilganlar */
export default function DriverHome() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { me } = useAuth();
  const q = useQuery({ queryKey: ['driver', 'list'], queryFn: () => api<DriverList>('/driver/deliveries') });

  const header = (
    <Stack.Screen
      options={{
        title: me?.fullName ?? t('drvTitle'),
        headerRight: () => <IconButton icon="gear-six" label={t('settings')} onPress={() => router.push('/settings')} />,
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
  const { today } = q.data;
  const sections = driverSections(q.data);
  const empty = sections.some((s) => s.key === 'upcoming') ? (
    <EmptyState icon="truck" title={t('drvNoneToday')} />
  ) : (
    <EmptyState icon="truck" title={t('drvEmpty')} hint={t('drvEmptyHint')} />
  );

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
              <Text v="h2" style={{ marginTop: section.key === 'today' ? 0 : space(4) }}>
                {t(TITLES[section.key])} · {section.data.length}
              </Text>
            )}
            renderSectionFooter={({ section }) =>
              (section.key === 'today' && !section.data.length ? empty : null)
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
