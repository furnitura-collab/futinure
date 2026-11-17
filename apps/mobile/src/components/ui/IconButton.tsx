import { useState } from 'react';
import { radius, useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './Pressable';
import { Tooltip } from './Tooltip';

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
  const [hover, setHover] = useState(false);
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
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      hoverStyle={variant === 'ghost' ? { backgroundColor: colors.muted } : { filter: 'brightness(0.94)' }}
      style={{ width: size, height: size, borderRadius: radius.full, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={icon} size={Math.round(size * 0.48)} color={fg} />
      <Tooltip label={label} visible={hover && !disabled} />
    </PressableScale>
  );
}
