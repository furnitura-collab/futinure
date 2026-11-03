import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Loader, ToastProvider } from '../components/ui';
import { ApiError } from '../lib/api';
import { AuthProvider, useAuth } from '../lib/auth';
import { I18nProvider, useI18n } from '../lib/i18n';
import { usePushNotifications } from '../lib/push';
import { RealtimeProvider } from '../lib/realtime';
import { colors } from '../lib/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
    },
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <ToastProvider>
              <AuthProvider>
                <RealtimeProvider>
                  <StatusBar style="dark" />
                  {/* Web'da (brauzer, sinov) — telefon kengligida, markazda */}
                  <View style={Platform.OS === 'web' ? { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border } : { flex: 1 }}>
                    <Navigator />
                  </View>
                </RealtimeProvider>
              </AuthProvider>
            </ToastProvider>
          </I18nProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Kim kirganiga qarab qaysi ekranlar ochiqligi (Stack.Protected) */
function Navigator() {
  const { booting, me } = useAuth();
  const { t } = useI18n();
  usePushNotifications();
  if (booting) return <Loader />;

  const customer = me?.role === 'CUSTOMER';
  const driver = me?.role === 'DRIVER';
  const needsSetup = customer && !me.fullName;
  // Ruxsat yo'q ekranga (masalan, kirgandan keyin "/") tushsa — rolning bosh ekraniga
  const home = !me ? '/login' : needsSetup ? '/setup' : driver ? '/driver' : !customer ? '/staff' : '/';
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.brand,
        headerTitleStyle: { color: colors.text },
        headerBackTitle: t('back'),
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={!me}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!needsSetup}>
        <Stack.Screen name="setup" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={driver} redirectTo={home}>
        <Stack.Screen name="driver/index" />
        <Stack.Screen name="driver/[id]" options={{ title: '' }} />
        <Stack.Screen name="driver/deliver" options={{ title: t('drvDeliver'), presentation: 'modal' }} />
        <Stack.Screen name="driver/fail" options={{ title: t('drvFail'), presentation: 'modal' }} />
      </Stack.Protected>
      {/* Boshqa xodimlar admin paneldan ishlaydi */}
      <Stack.Protected guard={!!me && !customer && !driver}>
        <Stack.Screen name="staff" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!customer && !needsSetup} redirectTo={home}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[id]" options={{ title: '' }} />
        <Stack.Screen name="sku" options={{ title: t('quickSku'), presentation: 'modal' }} />
        <Stack.Screen name="checkout" options={{ title: t('checkoutTitle') }} />
        <Stack.Screen name="order/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="order/[id]/chat" options={{ title: t('chat') }} />
        <Stack.Screen name="pay" options={{ title: t('payTitle'), presentation: 'modal' }} />
        <Stack.Screen name="balance" options={{ title: t('ledger') }} />
        <Stack.Screen name="addresses" options={{ title: t('addresses') }} />
        <Stack.Screen name="address-new" options={{ title: t('addAddress'), presentation: 'modal' }} />
        <Stack.Screen name="notifications" options={{ title: t('notifications') }} />
      </Stack.Protected>
    </Stack>
  );
}
