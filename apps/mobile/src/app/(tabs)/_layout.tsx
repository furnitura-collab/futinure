import { useQuery } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { Ionicons, type IconName } from '../../components/ui';
import { api } from '../../lib/api';
import { useCart } from '../../lib/cart';
import { useI18n } from '../../lib/i18n';
import { colors } from '../../lib/theme';
import type { OrderListItem, Paginated } from '../../lib/types';

const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };

export default function TabsLayout() {
  const { t } = useI18n();
  const cart = useCart();
  // Javob kutayotgan taklif yoki o'qilmagan xabar bor buyurtmalar soni
  const orders = useQuery({
    queryKey: ['orders', 'active'],
    queryFn: () => api<Paginated<OrderListItem>>('/orders', { query: { active: true, limit: 50 } }),
  });
  const attention = orders.data?.items.filter((o) => o.hasPendingQuote || o.unreadMessages > 0).length ?? 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        headerTitleStyle: { color: colors.text },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabCatalog'), tabBarIcon: icon('grid-outline') }} />
      <Tabs.Screen
        name="cart"
        options={{
          title: t('tabCart'),
          tabBarIcon: icon('cart-outline'),
          tabBarBadge: cart.data?.count || undefined,
          tabBarBadgeStyle: { backgroundColor: colors.brand },
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t('tabOrders'),
          tabBarIcon: icon('receipt-outline'),
          tabBarBadge: attention || undefined,
          tabBarBadgeStyle: { backgroundColor: colors.violet },
        }}
      />
      <Tabs.Screen name="profile" options={{ title: t('tabProfile'), tabBarIcon: icon('person-outline') }} />
    </Tabs>
  );
}
