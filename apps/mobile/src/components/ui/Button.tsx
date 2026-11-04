import { ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { useSite } from '@/lib/layout';
import { font, radius, space, useTheme, type ThemeColors } from '@/theme';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './Pressable';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

const HEIGHT: Record<ButtonSize, number> = { sm: 40, md: 46, lg: 52 };

function palette(c: ThemeColors, v: ButtonVariant): { bg: string; fg: string; border?: string } {
  switch (v) {
    case 'primary':
      return { bg: c.primary, fg: c.primaryForeground };
    case 'secondary':
      return { bg: c.secondary, fg: c.secondaryForeground };
    case 'outline':
      return { bg: c.card, fg: c.foreground, border: c.border };
    case 'ghost':
      return { bg: 'transparent', fg: c.accentForeground };
    case 'destructive':
      return { bg: c.destructive, fg: c.destructiveForeground };
  }
}

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Saytda ham to'liq kenglik (yon ustundagi asosiy tugma); aks holda saytda tugma matnicha keng */
  block?: boolean;
}

export function Button({ title, onPress, variant = 'primary', size = 'lg', icon, loading, disabled, style, accessibilityLabel, block }: ButtonProps) {
  const { colors, shadow } = useTheme();
  const { site } = useSite();
  const p = palette(colors, variant);
  const off = disabled || loading;
  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      hitSlop={size === 'sm' ? 4 : undefined}
      hoverStyle={p.bg === 'transparent' || variant === 'outline' ? { backgroundColor: colors.muted } : { filter: 'brightness(0.94)' }}
      style={[
        {
          height: HEIGHT[size],
          paddingHorizontal: size === 'sm' ? space(3) : space(5),
          borderRadius: size === 'sm' ? radius.sm + 2 : radius.md,
          backgroundColor: p.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space(2),
        },
        p.border ? { borderWidth: 1, borderColor: p.border } : null,
        variant === 'primary' && !off ? shadow : null,
        site && !block ? { alignSelf: 'flex-start' } : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={p.fg} /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} color={p.fg} /> : null}
      <Text bold color={p.fg} numberOfLines={1} style={{ fontSize: size === 'sm' ? font.sm : font.base }}>
        {title}
      </Text>
    </PressableScale>
  );
}
