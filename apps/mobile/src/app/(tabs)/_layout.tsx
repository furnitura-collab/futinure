import { Tabs } from 'expo-router';
import { StyleSheet, type ColorValue } from 'react-native';
import { useNavChrome } from '@/components/nav/useNavChrome';
import { GlassView, Icon, type IconName } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useCart } from '@/lib/cart';
import { useLayout, useSite } from '@/lib/layout';
import { useAttentionCount } from '@/lib/orders';
import { radius, space, useTheme } from '@/theme';

const icon = (name: IconName, active: IconName) =>
  function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    return <Icon name={focused ? active : name} color={color as string} size={size - 2} />;
  };

export default function TabsLayout() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { header } = useNavChrome();
  const cart = useCart();
  const { wide, desktop } = useLayout();
  // Saytda navigatsiya umumiy sarlavhada — tab bar va tab sarlavhalari kerak emas
  const { site } = useSite();
  const attention = useAttentionCount();

  return (
    <Tabs
      tabBar={site ? () => null : undefined}
      screenOptions={{
        ...header,
        ...(site && { headerShown: false }),
        // Native planshetda — chapda sidebar (ikonka + nom), telefonda — pastda shisha panel
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarVariant: wide && !desktop ? 'material' : 'uikit',
        tabBarLabelPosition: desktop ? 'beside-icon' : 'below-icon',
        tabBarStyle: wide
          ? { backgroundColor: 'transparent', borderRightColor: colors.glassBorder, ...(desktop && { minWidth: 240, width: 240, paddingTop: space(4) }) }
          : { position: 'absolute', backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0 },
        tabBarBackground: () => (
          <GlassView
            bordered={false}
            intensity={60}
            style={[StyleSheet.absoluteFill, wide ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder }]}
          />
        ),
        tabBarItemStyle: desktop ? { justifyContent: 'flex-start', paddingHorizontal: space(3), marginHorizontal: space(2), borderRadius: radius.md, maxHeight: 44 } : undefined,
        tabBarLabelStyle: { fontWeight: '600' },
        tabBarActiveBackgroundColor: desktop ? colors.primarySoft : undefined,
        tabBarActiveTintColor: colors.accentForeground,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarBadgeStyle: { backgroundColor: colors.primary, color: colors.primaryForeground, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabHome'), headerShown: false, tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="catalog" options={{ title: t('tabCatalog'), tabBarIcon: icon('grid-outline', 'grid') }} />
      <Tabs.Screen name="cart" options={{ title: t('tabCart'), tabBarIcon: icon('cart-outline', 'cart'), tabBarBadge: cart.data?.count || undefined }} />
      <Tabs.Screen
        name="orders"
        options={{
          title: t('tabOrders'),
          tabBarIcon: icon('receipt-outline', 'receipt'),
          tabBarBadge: attention || undefined,
          tabBarBadgeStyle: { backgroundColor: colors.violet, color: colors.background, fontSize: 11 },
        }}
      />
      <Tabs.Screen name="profile" options={{ title: t('tabProfile'), tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
