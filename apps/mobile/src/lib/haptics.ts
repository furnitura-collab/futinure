import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Telefonda yengil tebranish — webda hech narsa qilmaydi */
export const haptic = {
  tap: () => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  success: () => {
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
};
