import { router, useGlobalSearchParams, usePathname, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { View, type TextInput } from 'react-native';
import { LogoMark } from '@/components/LogoMark';
import { Avatar, CountBadge, Icon, IconButton, Input, PressableScale, Text, type IconName } from '@/components/ui';
import { useI18n, type I18nKey } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { contained, CONTENT, useLayout, useSite } from '@/lib/layout';
import { useUnreadCount } from '@/lib/notifications';
import { useAttentionCount } from '@/lib/orders';
import { radius, space, useTheme } from '@/theme';

const HEADER_HEIGHT = 64;
const NAV_ITEM_HEIGHT = 40;
/** Faol bo'lim chizig'i sarlavhaning pastki chegarasiga yopishadi */
const INDICATOR_OFFSET = -(HEADER_HEIGHT - NAV_ITEM_HEIGHT) / 2;

interface NavLink {
  href: Href;
  label: I18nKey;
  icon: IconName;
  match: (path: string) => boolean;
}

// Bosh sahifa — logotip orqali (alohida "Bosh sahifa" havolasi takror bo'lardi)
const LINKS: NavLink[] = [
  { href: '/catalog', label: 'tabCatalog', icon: 'grid-outline', match: (p) => p.startsWith('/catalog') || p.startsWith('/product') },
  // "/orders" ro'yxati ham, "/order/…" sahifasi ham
  { href: '/orders', label: 'tabOrders', icon: 'receipt-outline', match: (p) => p.startsWith('/order') },
];

/** Yozish maydonida "/" — oddiy belgi, tezkor tugma emas */
const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * Saytning doimiy sarlavhasi: brend, asosiy bo'limlar, qidiruv, kod bo'yicha buyurtma, bildirishnoma, savat va hisob.
 * 768–1279px da matnlar ikonkaga aylanadi va qidiruv torayadi.
 */
export function WebHeader() {
  const { t, money } = useI18n();
  const { colors } = useTheme();
  const { me } = useAuth();
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
      <View style={[contained(CONTENT.wide), { flex: 1, flexDirection: 'row', alignItems: 'center', gap: desktop ? space(3) : space(2), paddingHorizontal: gutter }]}>
        <PressableScale onPress={() => router.navigate('/')} accessibilityRole="link" accessibilityLabel={t('appName')} scale={0.97} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), marginRight: space(2) }}>
          <LogoMark size={36} />
          {full && <Text v="h2" bold>{t('appName')}</Text>}
        </PressableScale>

        <View accessibilityRole="navigation" accessibilityLabel={t('mainNav')} style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
          {LINKS.map((l) => {
            const active = l.match(path);
            const badge = l.href === '/orders' ? attention : 0;
            return (
              <PressableScale
                key={l.label}
                onPress={() => router.navigate(l.href)}
                accessibilityRole="link"
                accessibilityLabel={t(l.label)}
                accessibilityState={{ selected: active }}
                scale={0.97}
                hoverStyle={{ backgroundColor: colors.muted }}
                style={{ height: NAV_ITEM_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: desktop ? space(3) : space(2), borderRadius: radius.md }}
              >
                {desktop ? (
                  <Text bold color={active ? colors.foreground : colors.mutedForeground}>{t(l.label)}</Text>
                ) : (
                  <Icon name={l.icon} size={22} color={active ? colors.foreground : colors.mutedForeground} />
                )}
                {badge > 0 && (
                  <View style={desktop ? null : { position: 'absolute', top: 0, right: -2 }}>
                    <CountBadge count={badge} tone="violet" />
                  </View>
                )}
                {active && <View style={{ position: 'absolute', left: space(2), right: space(2), bottom: INDICATOR_OFFSET, height: 2, borderRadius: 1, backgroundColor: colors.primary }} />}
              </PressableScale>
            );
          })}
        </View>

        <View accessibilityRole="search" style={{ flex: 1, minWidth: 140, maxWidth: 520, marginHorizontal: desktop ? space(3) : space(1) }}>
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
            right={
              q ? (
                <IconButton
                  icon="close-circle"
                  label={t('clear')}
                  size={32}
                  onPress={() => {
                    setQ('');
                    if (path === '/catalog') submit('');
                  }}
                />
              ) : full ? (
                <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.sm - 2, borderWidth: 1, borderColor: colors.border }}>
                  <Text v="caption">/</Text>
                </View>
              ) : null
            }
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1), marginLeft: 'auto' }}>
          {full ? (
            <PressableScale
              onPress={() => router.push('/sku')}
              accessibilityRole="button"
              accessibilityLabel={t('quickSku')}
              hoverStyle={{ backgroundColor: colors.muted }}
              style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), borderRadius: radius.md }}
            >
              <Icon name="barcode-outline" size={20} />
              <Text v="small" bold>{t('byCode')}</Text>
            </PressableScale>
          ) : (
            <IconButton icon="barcode-outline" label={t('quickSku')} size={40} onPress={() => router.push('/sku')} />
          )}

          <View>
            <IconButton icon="notifications-outline" label={t('notifications')} size={40} onPress={() => router.push('/notifications')} />
            {unread > 0 && (
              <View pointerEvents="none" style={{ position: 'absolute', top: -2, right: -2 }}>
                <CountBadge count={unread} />
              </View>
            )}
          </View>

          <PressableScale
            onPress={() => router.navigate('/cart')}
            accessibilityRole="link"
            accessibilityLabel={t('cartButton', { n: count, total: money(cart.data?.itemsTotal ?? 0) })}
            scale={0.97}
            hoverStyle={{ filter: 'brightness(0.95)' }}
            style={{
              height: 40,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space(2),
              paddingHorizontal: space(3),
              borderRadius: radius.full,
              backgroundColor: path === '/cart' ? colors.primary : colors.primarySoft,
            }}
          >
            {/* Belgi ikonka burchagida — yonidagi summa bilan to'qnashmasin */}
            <View style={{ marginRight: count > 0 ? space(2) : 0 }}>
              <Icon name="cart-outline" size={20} color={path === '/cart' ? colors.primaryForeground : colors.accentForeground} />
              {count > 0 && (
                <View pointerEvents="none" style={{ position: 'absolute', top: -9, right: -14 }}>
                  <CountBadge count={count} />
                </View>
              )}
            </View>
            {desktop && (
              <Text v="small" bold numberOfLines={1} color={path === '/cart' ? colors.primaryForeground : colors.accentForeground}>
                {count ? money(cart.data?.itemsTotal ?? 0) : t('tabCart')}
              </Text>
            )}
          </PressableScale>

          <PressableScale
            onPress={() => router.navigate('/profile')}
            accessibilityRole="link"
            accessibilityLabel={t('tabProfile')}
            scale={0.95}
            style={{ marginLeft: space(1), padding: 2, borderRadius: radius.full, borderWidth: 2, borderColor: path === '/profile' ? colors.primary : 'transparent' }}
          >
            <Avatar name={me?.fullName} size={34} />
          </PressableScale>
        </View>
      </View>
    </View>
  );
}
