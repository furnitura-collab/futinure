import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, Card, Ionicons, Row, Segmented, Text, type IconName } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { phone, som } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { colors, space } from '../../lib/theme';
import type { Balance, Notification, Paginated } from '../../lib/types';
import { contained, CONTENT } from '../../lib/layout';

export default function Profile() {
  const { me, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const balance = useQuery({ queryKey: ['balance'], queryFn: () => api<Balance>('/me/balance') });
  const notifications = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api<Paginated<Notification> & { unread: number }>('/notifications', { query: { limit: 1 } }),
  });
  const b = balance.data;
  const p = me?.customerProfile;

  return (
    <ScrollView contentContainerStyle={{ ...contained(CONTENT.page), padding: space(4), gap: space(4) }}>
      <View style={{ gap: 2 }}>
        <Text v="title">{me?.fullName}</Text>
        <Text muted>
          {[p?.companyName, me && phone(me.phone), p?.priceGroup?.name].filter(Boolean).join(' · ')}
        </Text>
      </View>

      {b && (
        <Card style={{ gap: space(3) }} onPress={() => router.push('/balance')}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text muted>{t('balance')}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Row>
          <Text v="title" color={b.balance > 0 ? colors.warning : b.balance < 0 ? colors.success : colors.text}>
            {b.balance > 0 ? `${t('debt')}: ${som(b.balance, locale)}` : b.balance < 0 ? `${t('credit')}: ${som(-b.balance, locale)}` : som(0, locale)}
          </Text>
          {b.creditLimit > 0 && (
            <Text v="small" muted>
              {t('creditLimit')}: {som(b.creditLimit, locale)}
            </Text>
          )}
          {b.overdueAmount > 0 && (
            <Text v="small" bold color={colors.danger}>
              {t('overdue')}: {som(b.overdueAmount, locale)}
            </Text>
          )}
        </Card>
      )}

      <Card style={{ padding: 0 }}>
        <Item icon="notifications-outline" label={t('notifications')} badge={notifications.data?.unread} onPress={() => router.push('/notifications')} />
        <Item icon="location-outline" label={t('addresses')} onPress={() => router.push('/addresses')} />
        <Item icon="document-text-outline" label={t('ledger')} onPress={() => router.push('/balance')} last />
      </Card>

      <View style={{ gap: space(2) }}>
        <Text v="small" bold>{t('language')}</Text>
        <Segmented value={locale} onChange={setLocale} options={[{ value: 'uz', label: "O'zbekcha" }, { value: 'ru', label: 'Русский' }]} />
      </View>

      <Button title={t('logout')} icon="log-out-outline" variant="ghost" onPress={() => void logout()} />
    </ScrollView>
  );
}

function Item({ icon, label, onPress, badge, last }: { icon: IconName; label: string; onPress: () => void; badge?: number; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(4), borderBottomWidth: last ? 0 : 1, borderColor: colors.border }}>
      <Ionicons name={icon} size={22} color={colors.brand} />
      <Text style={{ flex: 1 }}>{label}</Text>
      {!!badge && (
        <View style={{ backgroundColor: colors.brand, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 }}>
          <Text v="caption" bold color="#fff">{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}
