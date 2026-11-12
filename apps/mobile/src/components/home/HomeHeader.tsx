import { router } from 'expo-router';
import { View } from 'react-native';
import { LogoMark } from '@/components/LogoMark';
import { HEADER_BUTTON, HeaderControls } from '@/components/nav/HeaderControls';
import { CountBadge, IconButton, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useSite } from '@/lib/layout';
import { useUnreadCount } from '@/lib/notifications';
import { space } from '@/theme';

/**
 * Bosh sahifa boshi. Ilovada — brend (logo + nom), til, mavzu va bildirishnomalar;
 * saytda logo yuqori sarlavhada bor — shuning uchun salomlashish: ism va firma.
 */
export function HomeHeader() {
  const { me } = useAuth();
  const { t } = useI18n();
  const { site } = useSite();
  const unread = useUnreadCount();
  const p = me?.customerProfile;
  const first = me?.fullName?.split(/\s+/)[0] ?? '';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
      {site ? (
        <View style={{ flex: 1, gap: 2 }}>
          <Text v="display" accessibilityRole="header" numberOfLines={1}>{t('hello', { name: first })}</Text>
          {!!p?.companyName && <Text muted numberOfLines={1}>{p.companyName}</Text>}
        </View>
      ) : (
        <View accessibilityRole="header" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          <LogoMark size={28} />
          <Text v="heading" bold numberOfLines={1} style={{ flexShrink: 1 }}>{t('appName')}</Text>
        </View>
      )}
      {!site && <HeaderControls />}
      {!site && (
        <View>
          <IconButton icon="notifications-outline" size={HEADER_BUTTON} label={t('notifications')} onPress={() => router.push('/notifications')} />
          {unread > 0 && (
            <View pointerEvents="none" style={{ position: 'absolute', top: -6, right: -6 }}>
              <CountBadge count={unread} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}
