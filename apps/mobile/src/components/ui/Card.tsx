import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, space, toneColors, useTheme, type Tone } from '@/theme';
import { PressableScale } from './Pressable';

interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Holat rangidagi yumshoq karta (ogohlantirish, taklif) */
  tone?: Tone;
  accessibilityLabel?: string;
}

/** Kontent kartasi — doim to'liq rangli (shisha faqat navigatsiya panellarida) */
export function Card({ children, style, onPress, tone, accessibilityLabel }: CardProps) {
  const { colors, shadow, shadowLg } = useTheme();
  const tinted = tone ? toneColors(colors, tone) : null;
  const surface: ViewStyle = {
    borderRadius: radius.lg,
    padding: space(4),
    backgroundColor: tinted ? tinted.bg : colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tinted ? tinted.bg : colors.border,
    ...(tinted ? null : shadow),
  };

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        scale={0.985}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hoverStyle={[shadowLg, { top: -2 }]}
        style={[surface, style]}
      >
        {children}
      </PressableScale>
    );
  }
  return <View style={[surface, style]}>{children}</View>;
}
