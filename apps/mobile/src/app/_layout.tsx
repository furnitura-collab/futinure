import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useNavChrome } from '@/components/nav/useNavChrome';
import { Background, Text, ToastProvider } from '@/components/ui';
import { WebShell } from '@/components/web/WebShell';
import { I18nProvider, useI18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useLayout } from '@/lib/layout';
import { usePushNotifications } from '@/lib/push';
import { RealtimeProvider } from '@/lib/realtime';
import { radius, space, ThemeProvider, useTheme } from '@/theme';

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
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <I18nProvider>
              <ToastProvider>
                <AuthProvider>
                  <RealtimeProvider>
                    <Navigator />
                  </RealtimeProvider>
                </AuthProvider>
              </ToastProvider>
            </I18nProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Boot() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(6) }}>
      <Background />
      <View style={{ width: 64, height: 64, borderRadius: radius.lg + 2, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Text v="title" color={colors.primaryForeground}>M</Text>
      </View>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

/** Kim kirganiga qarab qaysi ekranlar ochiqligi (Stack.Protected) */
function Navigator() {
  const { booting, me } = useAuth();
  const { t } = useI18n();
  const { scheme, colors } = useTheme();
  const { navTheme, header } = useNavChrome();
  const { wide } = useLayout();
  usePushNotifications();

  const customer = me?.role === 'CUSTOMER';
  const driver = me?.role === 'DRIVER';
  const needsSetup = customer && !me.fullName;
  // Ruxsat yo'q ekranga (masalan, kirgandan keyin "/") tushsa — rolning bosh ekraniga
  const home = !me ? '/login' : needsSetup ? '/setup' : driver ? '/driver' : !customer ? '/staff' : '/';
  // Kompyuter brauzerida mijoz — sayt: umumiy sarlavha, sahifalar o'z sarlavhasini chizadi, modallar — markazdagi oyna
  const site = Platform.OS === 'web' && wide && !!customer && !needsSetup;
  const modal = site ? { presentation: 'transparentModal' as const, contentStyle: { backgroundColor: 'transparent' } } : { presentation: 'modal' as const };

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {booting ? (
        <Boot />
      ) : (
        <WebShell enabled={site}>
          <Stack screenOptions={{ ...header, headerShown: !site, headerBackTitle: t('back'), contentStyle: { backgroundColor: colors.background } }}>
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
              <Stack.Screen name="settings" options={{ title: t('settings') }} />
            </Stack.Protected>
            {/* Boshqa xodimlar admin paneldan ishlaydi */}
            <Stack.Protected guard={!!me && !customer && !driver}>
              <Stack.Screen name="staff" options={{ headerShown: false }} />
            </Stack.Protected>
            <Stack.Protected guard={!!customer && !needsSetup} redirectTo={home}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="product/[id]" options={{ title: '' }} />
              <Stack.Screen name="sku" options={{ title: t('quickSku'), ...modal }} />
              <Stack.Screen name="checkout" options={{ title: t('checkoutTitle') }} />
              <Stack.Screen name="order/[id]/index" options={{ title: '' }} />
              <Stack.Screen name="order/[id]/chat" options={{ title: t('chat') }} />
              <Stack.Screen name="pay" options={{ title: t('payTitle'), ...modal }} />
              <Stack.Screen name="balance" options={{ title: t('paymentsHistory') }} />
              <Stack.Screen name="addresses" options={{ title: t('addresses') }} />
              <Stack.Screen name="address-new" options={{ title: t('addAddress'), ...modal }} />
              <Stack.Screen name="notifications" options={{ title: t('notifications') }} />
            </Stack.Protected>
            <Stack.Protected guard={driver || (!!customer && !needsSetup)}>
              <Stack.Screen name="password" options={{ title: t('changePassword'), ...modal }} />
            </Stack.Protected>
          </Stack>
        </WebShell>
      )}
    </NavThemeProvider>
  );
}
