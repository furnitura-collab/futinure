import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { font, toneColors, useTheme, type Tone } from '@/theme';

type Variant = 'display' | 'title' | 'heading' | 'h2' | 'body' | 'small' | 'caption';

/** Ierarxiya: ekran sarlavhasi (title 26), bo'lim (h2 17), matn 15, izoh 13 */

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontSize: font['3xl'], fontWeight: '700', letterSpacing: -0.6 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4 },
  heading: { fontSize: font.xl, fontWeight: '700', letterSpacing: -0.2 },
  h2: { fontSize: font.lg, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: font.base, lineHeight: 21 },
  small: { fontSize: font.sm, lineHeight: 18 },
  caption: { fontSize: font.sm, lineHeight: 18 },
};

export interface TextProps extends RNTextProps {
  v?: Variant;
  muted?: boolean;
  bold?: boolean;
  /** Holat rangi (success, destructive, …) */
  tone?: Tone;
  /** Aniq rang — faqat mavzu tokenidan (masalan, primaryForeground) */
  color?: string;
  center?: boolean;
}

export function Text({ v = 'body', muted, bold, tone, color, center, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const fg =
    color ?? (tone && tone !== 'neutral' ? toneColors(colors, tone).fg : muted || v === 'caption' ? colors.mutedForeground : colors.foreground);
  return (
    <RNText
      {...rest}
      style={[VARIANTS[v], { color: fg }, bold && { fontWeight: '600' }, center && { textAlign: 'center' }, style]}
    />
  );
}
