import { router, useGlobalSearchParams, usePathname, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, View, type TextInput } from 'react-native';
import { LanguageMenu } from '@/components/LanguageMenu';
import { LogoMark } from '@/components/LogoMark';
import { CountBadge, Icon, IconButton, Input, PressableScale, Text, type IconName } from '@/components/ui';
import { useI18n, type I18nKey } from '@/i18n';
import { useCart } from '@/lib/cart';
import { useCategories } from '@/lib/categories';
import { contained, CONTENT, useLayout, useSite } from '@/lib/layout';
import { useUnreadCount } from '@/lib/notifications';
import { useAttentionCount } from '@/lib/orders';
import { radius, space, useTheme } from '@/theme';
import { AccountMenu } from './AccountMenu';

const BAR_HEIGHT = 64;
const NAV_HEIGHT = 44;
/** Sarlavhadagi boshqaruvlar (qidiruv, tugmalar) bir balandlikda */
const CONTROL_HEIGHT = 40;

interface Section {
  href: Href;
  label: I18nKey;
  match: (path: string, categoryId?: string) => boolean;
}

// Bosh sahifa — logotip orqali. Yangi bo'lim shu ro'yxatga qo'shiladi: pastki qator aylanadi, sarlavha sig'maslik muammosi yo'q
const SECTIONS: Section[] = [
  { href: '/catalog', label: 'tabCatalog', match: (p, c) => (p.startsWith('/catalog') && !c) || p.startsWith('/product') },
  // "/orders" ro'yxati ham, "/order/…" sahifasi ham
  { href: '/orders', label: 'tabOrders', match: (p) => p.startsWith('/order') },
];

/** Yozish maydonida "/" — oddiy belgi, tezkor tugma emas */
const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * Saytning doimiy sarlavhasi, ikki qator:
 *   1) brend · qidiruv · harakatlar (faqat ikonka: kod bo'yicha, til, bildirishnoma, savat) | hisob
 *   2) bo'limlar va kategoriyalar — matn, ko'payganda gorizontal aylanadi
 */
export function WebHeader() {
  const { colors } = useTheme();
  return (
    // Kontent sarlavha ostidan o'tmaydi (WebShell'da alohida blok) — blur (backdrop-filter) har kadrda behuda hisoblanardi
    <View role="banner" style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 10 }}>
      <TopBar />
      <NavBar />
    </View>
  );
}

function TopBar() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { width, desktop } = useLayout();
  const { gutter } = useSite();
  const path = usePathname();
  const params = useGlobalSearchParams<{ q?: string }>();
  const cart = useCart();
  const unread = useUnreadCount();
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

  return (
    <View style={[contained(CONTENT.wide), { height: BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: space(desktop ? 6 : 4), paddingHorizontal: gutter }]}>
      <PressableScale onPress={() => router.navigate('/')} accessibilityRole="link" accessibilityLabel={t('appName')} scale={0.97} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
        <LogoMark size={32} />
        {desktop && <Text v="heading" bold numberOfLines={1}>{t('appName')}</Text>}
      </PressableScale>

      <View accessibilityRole="search" style={{ flex: 1, maxWidth: 640, marginHorizontal: 'auto' }}>
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
            ) : width >= CONTENT.wide ? (
              <View style={{ paddingHorizontal: 6, borderRadius: radius.sm - 2, borderWidth: 1, borderColor: colors.border }}>
                <Text v="caption">/</Text>
              </View>
            ) : null
          }
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
        <HeaderAction icon="barcode-outline" label={t('quickSku')} onPress={() => router.push('/sku')} />
        <LanguageMenu />
        <HeaderAction icon="notifications-outline" label={t('notifications')} badge={unread} active={path === '/notifications'} onPress={() => router.push('/notifications')} />
        <HeaderAction icon="cart-outline" label={t('tabCart')} badge={cart.data?.count ?? 0} active={path === '/cart'} onPress={() => router.navigate('/cart')} />
        <View style={{ width: 1, height: 24, backgroundColor: colors.border, marginHorizontal: space(2) }} />
        <AccountMenu />
      </View>
    </View>
  );
}

/** Bo'limlar | kategoriyalar. Hammasi matn; joy yetmasa qator gorizontal aylanadi */
function NavBar() {
  const { t, name } = useI18n();
  const { colors } = useTheme();
  const { gutter } = useSite();
  const path = usePathname();
  const { categoryId } = useGlobalSearchParams<{ categoryId?: string }>();
  const attention = useAttentionCount();
  const categories = useCategories();

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="navigation"
        accessibilityLabel={t('mainNav')}
        style={contained(CONTENT.wide)}
        contentContainerStyle={{ height: NAV_HEIGHT, alignItems: 'center', gap: space(1), paddingHorizontal: gutter - space(3) }}
      >
        {SECTIONS.map((s) => (
          <NavItem key={s.label} label={t(s.label)} badge={s.href === '/orders' ? attention : 0} active={s.match(path, categoryId)} onPress={() => router.navigate(s.href)} />
        ))}
        {!!categories.data?.length && <View style={{ width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: space(2) }} />}
        {categories.data?.map((c) => (
          <NavItem
            key={c.id}
            label={name(c)}
            active={path.startsWith('/catalog') && categoryId === c.id}
            onPress={() => router.navigate({ pathname: '/catalog', params: { categoryId: c.id } })}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function NavItem({ label, active, badge = 0, onPress }: { label: string; active: boolean; badge?: number; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      scale={0.97}
      hoverStyle={{ backgroundColor: colors.muted }}
      style={{ height: 32, flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), borderRadius: radius.md }}
    >
      <Text v="small" bold={active} color={active ? colors.foreground : colors.mutedForeground} numberOfLines={1}>{label}</Text>
      {badge > 0 && <CountBadge count={badge} tone="violet" />}
      {/* Faol chiziq qatorning pastki chegarasiga yopishadi */}
      {active && <View style={{ position: 'absolute', left: space(3), right: space(3), bottom: -(NAV_HEIGHT - 32) / 2, height: 2, borderRadius: 1, backgroundColor: colors.primary }} />}
    </PressableScale>
  );
}

/** O'ngdagi harakat — faqat ikonka (nomi ekran o'quvchida); son belgisi burchakda, faqat son */
function HeaderAction({ icon, label, badge = 0, active, onPress }: { icon: IconName; label: string; badge?: number; active?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label} (${badge})` : label}
      accessibilityState={{ selected: !!active }}
      scale={0.95}
      hoverStyle={{ backgroundColor: colors.muted }}
      style={{
        width: CONTROL_HEIGHT,
        height: CONTROL_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: active ? colors.muted : 'transparent',
      }}
    >
      <Icon name={icon} size={20} />
      {badge > 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 2, right: 0 }}>
          <CountBadge count={badge} />
        </View>
      )}
    </PressableScale>
  );
}
