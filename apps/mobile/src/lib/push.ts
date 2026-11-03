import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from './api';
import { useAuth } from './auth';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // Ilova ochiq bo'lsa ham ko'rsatamiz (real-time toast bilan birga)
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Kirgandan keyin push token olib serverga yuboradi.
 * Web va simulyatorda push yo'q — jim o'tkazib yuboriladi.
 * Production'da EAS projectId kerak (app.json → extra.eas.projectId).
 */
async function register(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Buyurtmalar', importance: Notifications.AndroidImportance.HIGH });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  const status = existing === 'granted' ? existing : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await api('/me/devices', { body: { token, platform: Platform.OS } });
}

export function usePushNotifications() {
  const { me } = useAuth();
  const driver = me?.role === 'DRIVER';

  useEffect(() => {
    if (!me) return;
    register().catch((e: unknown) => console.warn('Push ro\'yxatdan o\'tmadi:', e));
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bildirishnoma bosilsa — tegishli buyurtmaga
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const orderId = (r.notification.request.content.data as { orderId?: string } | undefined)?.orderId;
      if (!orderId) return;
      if (driver) router.push({ pathname: '/driver/[id]', params: { id: orderId } });
      else router.push({ pathname: '/order/[id]', params: { id: orderId } });
    });
    return () => sub.remove();
  }, [driver]);
}
