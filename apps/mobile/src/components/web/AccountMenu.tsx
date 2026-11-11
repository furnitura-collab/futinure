import { router, type Href } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { formatPhone } from '@mebel/shared';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { Avatar, Icon, PressableScale, Text, type IconName } from '@/components/ui';
import { useI18n, type I18nKey } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { radius, space, useTheme } from '@/theme';

const MENU_WIDTH = 288;

const LINKS: { href: Href; label: I18nKey; icon: IconName }[] = [
  { href: '/profile', label: 'tabProfile', icon: 'person-outline' },
  { href: '/addresses', label: 'addresses', icon: 'location-outline' },
  { href: '/balance', label: 'paymentsHistory', icon: 'document-text-outline' },
];

/**
 * Sarlavhadagi hisob tugmasi va menyusi: profil sahifalari, til, mavzu va chiqish.
 * Kam ishlatiladigan sozlamalar shu yerda — sarlavhaning o'zi faqat asosiy harakatlardan iborat.
 */
export function AccountMenu() {
  const { t } = useI18n();
  const { colors, shadowLg } = useTheme();
  const { me, logout } = useAuth();
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const open = () =>
    anchor.current?.measureInWindow((x, y, width, height) => setPos({ top: y + height + space(2), right: window.innerWidth - (x + width) }));
  const close = () => setPos(null);
  const go = (href: Href) => {
    close();
    router.navigate(href);
  };

  return (
    <>
      <View ref={anchor} collapsable={false}>
        <PressableScale
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={t('accountMenu')}
          accessibilityState={{ expanded: !!pos }}
          scale={0.97}
          hoverStyle={{ backgroundColor: colors.muted }}
          style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: space(1), paddingLeft: 4, paddingRight: space(2), borderRadius: radius.full }}
        >
          <Avatar name={me?.fullName} size={32} />
          <Icon name="chevron-down" size={16} muted />
        </PressableScale>
      </View>

      <Modal transparent visible={!!pos} onRequestClose={close} animationType="none">
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel={t('close')}>
          {pos && (
            // Menyu ichidagi bosish orqa fonga o'tib menyuni yopmasin
            <Pressable
              onPress={() => undefined}
              accessibilityRole="menu"
              style={[
                {
                  position: 'absolute',
                  top: pos.top,
                  right: pos.right,
                  width: MENU_WIDTH,
                  backgroundColor: colors.card,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingVertical: space(2),
                  cursor: 'auto',
                },
                shadowLg,
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(2) }}>
                <Avatar name={me?.fullName} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text bold numberOfLines={1}>{me?.fullName}</Text>
                  {!!me && <Text v="caption" numberOfLines={1}>{formatPhone(me.phone)}</Text>}
                </View>
              </View>

              <Separator />
              {LINKS.map((l) => (
                <MenuItem key={l.label} icon={l.icon} label={t(l.label)} onPress={() => go(l.href)} />
              ))}

              <Separator />
              <View style={{ paddingHorizontal: space(4), paddingVertical: space(2), gap: space(3) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text v="small" muted>{t('language')}</Text>
                  <LanguageSwitch />
                </View>
                <View style={{ gap: space(2) }}>
                  <Text v="small" muted>{t('theme')}</Text>
                  <ThemeSwitch />
                </View>
              </View>

              <Separator />
              <MenuItem
                icon="log-out-outline"
                label={t('logout')}
                destructive
                onPress={() => {
                  close();
                  void logout();
                }}
              />
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </>
  );
}

function Separator() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space(2) }} />;
}

function MenuItem({ icon, label, onPress, destructive }: { icon: IconName; label: string; onPress: () => void; destructive?: boolean }) {
  const { colors } = useTheme();
  const color = destructive ? colors.destructive : colors.foreground;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="menuitem"
      scale={1}
      hoverStyle={{ backgroundColor: colors.muted }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), height: 40, marginHorizontal: space(2), paddingHorizontal: space(2), borderRadius: radius.md }}
    >
      <Icon name={icon} size={18} color={color} />
      <Text v="small" color={color}>{label}</Text>
    </PressableScale>
  );
}
