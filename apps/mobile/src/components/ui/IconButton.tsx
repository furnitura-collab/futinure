import { radius, useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './Pressable';

/** Faqat ikonkali tugma — 44px bosish maydoni, ekran o'quvchi uchun nom majburiy */
export function IconButton({
  icon,
  onPress,
  label,
  variant = 'ghost',
  tone,
  size = 44,
  disabled,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  variant?: 'ghost' | 'secondary' | 'primary';
  tone?: 'destructive';
  size?: number;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const bg = variant === 'primary' ? colors.primary : variant === 'secondary' ? colors.secondary : 'transparent';
  const fg = variant === 'primary' ? colors.primaryForeground : tone === 'destructive' ? colors.destructive : colors.foreground;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scale={0.9}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      hoverStyle={variant === 'ghost' ? { backgroundColor: colors.muted } : { filter: 'brightness(0.94)' }}
      style={{ width: size, height: size, borderRadius: radius.full, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={icon} size={Math.round(size * 0.48)} color={fg} />
    </PressableScale>
  );
}
