import { router, type Href } from 'expo-router';
import { View } from 'react-native';
import { formatPhone } from '@mebel/shared';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { Avatar, Icon, PressableScale, Text } from '@/components/ui';
import { useI18n, type I18nKey } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { radius, space, useTheme } from '@/theme';
import { PopoverPanel, usePopover } from './Popover';

const LINKS: { href: Href; label: I18nKey }[] = [
  { href: '/profile', label: 'tabProfile' },
  { href: '/addresses', label: 'addresses' },
  { href: '/balance', label: 'paymentsHistory' },
];

/** Sarlavhadagi hisob menyusi: profil sahifalari, mavzu va chiqish (kam ishlatiladiganlar — sarlavhada joy egallamaydi) */
export function AccountMenu() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { me, logout } = useAuth();
  const menu = usePopover();
  const go = (href: Href) => {
    menu.close();
    router.navigate(href);
  };

  return (
    <>
      <View ref={menu.anchor} collapsable={false}>
        <PressableScale
          onPress={menu.open}
          accessibilityRole="button"
          accessibilityLabel={t('accountMenu')}
          accessibilityState={{ expanded: menu.expanded }}
          scale={0.97}
          hoverStyle={{ backgroundColor: colors.muted }}
          style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: space(1), paddingLeft: 4, paddingRight: space(2), borderRadius: radius.full }}
        >
          <Avatar name={me?.fullName} size={32} />
          <Icon name="chevron-down" size={16} muted />
        </PressableScale>
      </View>

      <PopoverPanel pos={menu.pos} onClose={menu.close} width={272}>
        <View style={{ paddingHorizontal: space(2), paddingVertical: space(2), gap: 2 }}>
          <Text bold numberOfLines={1}>{me?.fullName}</Text>
          {!!me && <Text v="caption" numberOfLines={1}>{formatPhone(me.phone)}</Text>}
        </View>
        <Separator />
        {LINKS.map((l) => (
          <MenuItem key={l.label} label={t(l.label)} onPress={() => go(l.href)} />
        ))}
        <Separator />
        <View style={{ paddingHorizontal: space(2), paddingVertical: space(1), gap: space(2) }}>
          <Text v="caption">{t('theme')}</Text>
          <ThemeSwitch />
        </View>
        <Separator />
        <MenuItem
          label={t('logout')}
          destructive
          onPress={() => {
            menu.close();
            void logout();
          }}
        />
      </PopoverPanel>
    </>
  );
}

function Separator() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space(2), marginHorizontal: -space(2) }} />;
}

function MenuItem({ label, onPress, destructive }: { label: string; onPress: () => void; destructive?: boolean }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="menuitem"
      scale={1}
      hoverStyle={{ backgroundColor: colors.muted }}
      style={{ height: 40, justifyContent: 'center', paddingHorizontal: space(2), borderRadius: radius.md }}
    >
      <Text v="small" color={destructive ? colors.destructive : colors.foreground}>{label}</Text>
    </PressableScale>
  );
}
