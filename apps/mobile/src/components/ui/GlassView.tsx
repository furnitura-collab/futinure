import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';

interface GlassViewProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  /** Chegara chizig'i (navigatsiya panellarida faqat bir tomoni kerak bo'lishi mumkin) */
  bordered?: boolean;
}

/**
 * Shisha yuza: iOS va webda haqiqiy blur, Androidda blur sekin/ishonchsiz —
 * deyarli to'liq rangli fon bilan almashtiriladi.
 */
export function GlassView({ children, style, intensity = 50, bordered = true }: GlassViewProps) {
  const { colors, scheme } = useTheme();
  const border = bordered ? { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder } : null;

  if (Platform.OS === 'android') {
    return <View style={[{ backgroundColor: colors.glassSolid }, border, style]}>{children}</View>;
  }
  return (
    <BlurView intensity={intensity} tint={scheme} style={[{ backgroundColor: colors.glass, overflow: 'hidden' }, border, style]}>
      {children}
    </BlurView>
  );
}
