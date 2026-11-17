import createIconSet from '@expo/vector-icons/createIconSet';
import { toneColors, useTheme, type Tone } from '@/theme';
import { GLYPHS, type IconName } from './glyphs';

export type { IconName };
export type IconWeight = 'regular' | 'fill';

/** Phosphor (admin panel bilan bir xil), faqat ishlatiladigan glif'lar — scripts/build_icons.py */
export const ICON_FONTS = {
  'phosphor-regular': require('../../../assets/fonts/phosphor-regular.ttf'),
  'phosphor-fill': require('../../../assets/fonts/phosphor-fill.ttf'),
};

const SETS = {
  regular: createIconSet(GLYPHS, 'phosphor-regular', ICON_FONTS['phosphor-regular']),
  fill: createIconSet(GLYPHS, 'phosphor-fill', ICON_FONTS['phosphor-fill']),
};

export function Icon({
  name,
  size = 20,
  tone,
  color,
  muted,
  weight = 'regular',
}: {
  name: IconName;
  size?: number;
  tone?: Tone;
  color?: string;
  muted?: boolean;
  weight?: IconWeight;
}) {
  const { colors } = useTheme();
  const c = color ?? (tone ? toneColors(colors, tone).fg : muted ? colors.mutedForeground : colors.foreground);
  const Set = SETS[weight];
  return <Set name={name} size={size} color={c} />;
}
