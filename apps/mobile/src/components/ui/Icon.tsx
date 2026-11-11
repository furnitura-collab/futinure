import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { toneColors, useTheme, type Tone } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, tone, color, muted }: { name: IconName; size?: number; tone?: Tone; color?: string; muted?: boolean }) {
  const { colors } = useTheme();
  const c = color ?? (tone ? toneColors(colors, tone).fg : muted ? colors.mutedForeground : colors.foreground);
  return <Ionicons name={name} size={size} color={c} />;
}
