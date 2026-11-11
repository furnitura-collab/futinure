import { router, useGlobalSearchParams, usePathname, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { View, type TextInput } from 'react-native';
import { LogoMark } from '@/components/LogoMark';
import { CountBadge, Icon, IconButton, Input, PressableScale, Text, type IconName } from '@/components/ui';
import { useI18n, type I18nKey } from '@/i18n';
import { useCart } from '@/lib/cart';
import { contained, CONTENT, useLayout, useSite } from '@/lib/layout';
import { useUnreadCount } from '@/lib/notifications';
import { useAttentionCount } from '@/lib/orders';
import { radius, space, useTheme } from '@/theme';
import { AccountMenu } from './AccountMenu';

const HEADER_HEIGHT = 64;
/** Sarlavhadagi hamma boshqaruvlar (qidiruv, tugmalar) bir balandlikda */
const CONTROL_HEIGHT = 40;
/** Faol bo'lim chizig'i sarlavhaning pastki chegarasiga yopishadi */
const INDICATOR_OFFSET = -(HEADER_HEIGHT - CONTROL_HEIGHT) / 2;

interface NavLink {
  href: Href;
  label: I18nKey;
  match: (path: string) => boolean;
}

// Bosh sahifa — logotip orqali (alohida "Bosh sahifa" havolasi takror bo'lardi)
const LINKS: NavLink[] = [
  { href: '/catalog', label: 'tabCatalog', match: (p) => p.startsWith('/catalog') || p.startsWith('/product') },
  // "/orders" ro'yxati ham, "/order/…" sahifasi ham
  { href: '/orders', label: 'tabOrders', match: (p) => p.startsWith('/order') },
];

/** Yozish maydonida "/" — oddiy belgi, tezkor tugma emas */
const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * Saytning doimiy sarlavhasi, uch qism:
 *   chap — brend va bo'limlar; o'rta — qidiruv; o'ng — kod bo'yicha, bildirishnoma, savat | hisob menyusi.
 * O'ngdagi tugmalar bir xil ko'rinishda (HeaderAction); til, mavzu va profil sahifalari — hisob menyusida.
 */
export function WebHeader() {
  const { t, money } = useI18n();
  const { colors } = useTheme();
  const { width, desktop } = useLayout();
  const { gutter } = useSite();
  const full = width >= CONTENT.wide;
  const path = usePathname();
  const params = useGlobalSearchParams<{ q?: string }>();
  const cart = useCart();
  const unread = useUnreadCount();
  const attention = useAttentionCount();
  const search = useRef<ComponentRef<typeof TextInput>>(null);
  const [q, setQ] = useState('');

  // Katalogdagi qidiruv bilan bir xil matn (filtr chipi tozalansa — bu yerda ham)
  useEffect(() => {
    if (path === '/catalog') setQ(params.q ?? '');
  }, [path, params.q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || isTyping(e.target)) return;
      e.preventDefault();
      search.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const submit = (text: string) => router.navigate({ pathname: '/catalog', params: { q: text.trim() } });
  const count = cart.data?.count ?? 0;

  return (
    // Kontent sarlavha ostidan o'tmaydi (WebShell'da alohida blok) — blur (backdrop-filter) har kadrda behuda hisoblanardi
    <View role="banner" style={{ height: HEADER_HEIGHT, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 10 }}>
      <View style={[contained(CONTENT.wide), { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(desktop ? 6 : 3), paddingHorizontal: gutter }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(desktop ? 5 : 3) }}>
          <PressableScale onPress={() => router.navigate('/')} accessibilityRole="link" accessibilityLabel={t('appName')} scale={0.97} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
            <LogoMark size={32} />
            {desktop && <Text v="heading" bold numberOfLines={1}>{t('appName')}</Text>}
          </PressableScale>

          <View accessibilityRole="navigation" accessibilityLabel={t('mainNav')} style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
            {LINKS.map((l) => (
              <NavItem key={l.label} label={t(l.label)} active={l.match(path)} badge={l.href === '/orders' ? attention : 0} onPress={() => router.navigate(l.href)} />
            ))}
          </View>
        </View>

        <View accessibilityRole="search" style={{ flex: 1, minWidth: 160, maxWidth: 560, marginHorizontal: 'auto' }}>
          <Input
            ref={search}
            icon="search"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => submit(q)}
            placeholder={t('searchPlaceholder')}
            accessibilityLabel={t('searchPlaceholder')}
            returnKeyType="search"
            autoCorrect={false}
            compact
            right={
              q ? (
                <IconButton
                  icon="close-circle"
                  label={t('clear')}
                  size={28}
                  onPress={() => {
                    setQ('');
                    if (path === '/catalog') submit('');
                  }}
                />
              ) : full ? (
                <View style={{ paddingHorizontal: 6, borderRadius: radius.sm - 2, borderWidth: 1, borderColor: colors.border }}>
                  <Text v="caption">/</Text>
                </View>
              ) : null
            }
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
          <HeaderAction icon="barcode-outline" label={t('quickSku')} text={full ? t('byCode') : undefined} onPress={() => router.push('/sku')} />
          <HeaderAction icon="notifications-outline" label={t('notifications')} badge={unread} active={path === '/notifications'} onPress={() => router.push('/notifications')} />
          <HeaderAction
            icon="cart-outline"
            label={t('cartButton', { n: count, total: money(cart.data?.itemsTotal ?? 0) })}
            text={desktop ? (count ? money(cart.data?.itemsTotal ?? 0) : t('tabCart')) : undefined}
            badge={count}
            active={path === '/cart'}
            onPress={() => router.navigate('/cart')}
          />
          <View style={{ width: 1, height: 24, backgroundColor: colors.border, marginHorizontal: space(2) }} />
          <AccountMenu />
        </View>
      </View>
    </View>
  );
}

function NavItem({ label, active, badge, onPress }: { label: string; active: boolean; badge: number; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      scale={0.97}
      hoverStyle={{ backgroundColor: colors.muted }}
      style={{ height: CONTROL_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), borderRadius: radius.md }}
    >
      <Text v="small" bold color={active ? colors.foreground : colors.mutedForeground}>{label}</Text>
      {badge > 0 && <CountBadge count={badge} tone="violet" />}
      {active && <View style={{ position: 'absolute', left: space(3), right: space(3), bottom: INDICATOR_OFFSET, height: 2, borderRadius: 1, backgroundColor: colors.primary }} />}
    </PressableScale>
  );
}

/** O'ng tomondagi harakat: ikonka (+ son belgisi burchakda), keng ekranda — yonida matn */
function HeaderAction({
  icon,
  label,
  text,
  badge = 0,
  active,
  onPress,
}: {
  icon: IconName;
  label: string;
  text?: string;
  badge?: number;
  active?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      scale={0.97}
      hoverStyle={{ backgroundColor: colors.muted }}
      style={{
        height: CONTROL_HEIGHT,
        minWidth: CONTROL_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space(2),
        paddingHorizontal: text ? space(3) : 0,
        borderRadius: radius.md,
        backgroundColor: active ? colors.muted : 'transparent',
      }}
    >
      <View>
        <Icon name={icon} size={20} />
        {badge > 0 && (
          <View pointerEvents="none" style={{ position: 'absolute', top: -8, right: -10 }}>
            <CountBadge count={badge} />
          </View>
        )}
      </View>
      {text ? (
        <Text v="small" bold numberOfLines={1} style={{ marginLeft: badge > 0 ? space(1) : 0 }}>
          {text}
        </Text>
      ) : null}
    </PressableScale>
  );
}
