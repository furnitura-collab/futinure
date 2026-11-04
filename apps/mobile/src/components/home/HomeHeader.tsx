import { router } from 'expo-router';
import { View } from 'react-native';
import { CountBadge, IconButton, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useSite } from '@/lib/layout';
import { useUnreadCount } from '@/lib/notifications';
import { space } from '@/theme';

/** Salomlashish: ism, firma/mijoz turi va bildirishnomalar (saytda qo'ng'iroqcha sarlavhada) */
export function HomeHeader() {
  const { me } = useAuth();
  const { t, customerType } = useI18n();
  const { site } = useSite();
  const unread = useUnreadCount();
  const p = me?.customerProfile;
  const first = me?.fullName?.split(/\s+/)[0] ?? '';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text v={site ? 'display' : 'title'} accessibilityRole={site ? 'header' : undefined} numberOfLines={1}>{t('hello', { name: first })}</Text>
        <Text muted numberOfLines={1}>{[p?.companyName, p && customerType(p.type)].filter(Boolean).join(' · ')}</Text>
      </View>
      {!site && (
        <View>
          <IconButton icon="notifications-outline" variant="secondary" label={t('notifications')} onPress={() => router.push('/notifications')} />
          {unread > 0 && (
            <View pointerEvents="none" style={{ position: 'absolute', top: -2, right: -2 }}>
              <CountBadge count={unread} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}
