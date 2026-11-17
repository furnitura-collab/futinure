import type { ReactNode } from 'react';
import { StyleSheet, type AccessibilityRole, type StyleProp, type ViewStyle } from 'react-native';
import { PressableScale } from '@/components/ui';
import { radius, useTheme } from '@/theme';

/** Bosiladigan katalog kartasi (mahsulot, kategoriya, "yana olish"): bir xil yuza, soya va hover */
export function TileCard({
  children,
  onPress,
  accessibilityLabel,
  accessibilityRole = 'link',
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityRole?: AccessibilityRole;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, shadow, shadowLg } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      scale={0.98}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      hoverStyle={[shadowLg, { top: -2 }]}
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          ...shadow,
        },
        style,
      ]}
    >
      {children}
    </PressableScale>
  );
}
