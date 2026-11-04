import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { Pressable, RefreshControl, SectionList } from 'react-native';
import { Badge, Empty, ErrorView, Ionicons, Loader, Row, Text } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { DELIVERY_TONE } from '../../lib/driver';
import { date, som } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { colors, radius, space } from '../../lib/theme';
import type { DriverDelivery, DriverList } from '../../lib/types';
import { contained, CONTENT } from '../../lib/layout';

/** Haydovchi: faol yetkazishlar (sana bo'yicha) va bugun topshirilganlar */
export default function DriverHome() {
  const { t, locale, setLocale } = useI18n();
  const { me, logout } = useAuth();
  const q = useQuery({ queryKey: ['driver', 'list'], queryFn: () => api<DriverList>('/driver/deliveries') });

  if (q.isPending) return <Loader />;
  if (q.error) return <ErrorView error={q.error} onRetry={() => void q.refetch()} />;
  const { active, done } = q.data;
  const sections = [
    { key: 'active', title: `${t('drvActive')} · ${active.length}`, data: active },
    ...(done.length ? [{ key: 'done', title: `${t('drvDone')} · ${done.length}`, data: done }] : []),
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: me?.fullName ?? t('drvTitle'),
          headerRight: () => (
            <Row style={{ gap: space(4), paddingHorizontal: space(2) }}>
              <Pressable onPress={() => setLocale(locale === 'uz' ? 'ru' : 'uz')} hitSlop={8}>
                <Text bold color={colors.brand}>{locale === 'uz' ? 'RU' : 'UZ'}</Text>
              </Pressable>
              <Pressable onPress={() => void logout()} hitSlop={8} accessibilityLabel={t('logout')}>
                <Ionicons name="log-out-outline" size={22} color={colors.muted} />
              </Pressable>
            </Row>
          ),
        }}
      />
      <SectionList
        sections={sections}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ ...contained(CONTENT.page), padding: space(4), gap: space(2) }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text v="small" bold muted style={{ marginTop: section.key === 'done' ? space(4) : 0, marginBottom: space(1) }}>
            {section.title}
          </Text>
        )}
        renderSectionFooter={({ section }) =>
          section.key === 'active' && !active.length ? <Empty icon="car-outline" title={t('drvEmpty')} hint={t('drvEmptyHint')} /> : null
        }
        renderItem={({ item }) => <DeliveryRow d={item} today={q.data.today} locale={locale} />}
      />
    </>
  );
}

function DeliveryRow({ d, today, locale }: { d: DriverDelivery; today: string; locale: 'uz' | 'ru' }) {
  const { t, status } = useI18n();
  const o = d.order;
  const a = o.addressSnapshot;
  const planned = d.scheduledDate?.slice(0, 10);
  const late = planned && planned < today && o.status !== 'DELIVERED' && o.status !== 'COMPLETED';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/driver/[id]', params: { id: o.id } })}
      style={({ pressed }) => ({
        backgroundColor: colors.card,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: o.status === 'OUT_FOR_DELIVERY' ? colors.brand : colors.border,
        padding: space(3),
        gap: space(1),
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <Text bold>{o.number}</Text>
        {o.status === 'OUT_FOR_DELIVERY' || o.status === 'READY' || d.status === 'DELIVERED' || d.status === 'FAILED' ? (
          <Badge label={t(`ds${d.status}`)} tone={DELIVERY_TONE[d.status]} />
        ) : (
          <Badge label={status(o.status)} tone="muted" />
        )}
      </Row>
      <Text numberOfLines={2}>{a?.addressText ?? '—'}</Text>
      <Text v="small" muted numberOfLines={1}>
        {[o.customer.fullName, o.customer.customerProfile?.companyName].filter(Boolean).join(', ')}
      </Text>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text v="caption" color={late ? colors.danger : colors.muted}>
          {planned ? t('drvPlanned', { date: date(d.scheduledDate) }) : ''} · {o.totalWeightKg} kg
        </Text>
        {o.toCollect > 0 && <Text v="small" bold color={colors.warning}>💵 {som(o.toCollect, locale)}</Text>}
      </Row>
    </Pressable>
  );
}
