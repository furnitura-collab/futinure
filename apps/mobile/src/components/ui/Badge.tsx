import { View } from 'react-native';
import { radius, toneColors, useTheme, type Tone } from '@/theme';
import { Text } from './Text';

interface BadgeProps {
  label: string;
  tone?: Tone;
  dot?: boolean;
  /** md — "harakat kerak" belgisi (kattaroq, ko'zga tashlanadi) */
  size?: 'sm' | 'md';
}

export function Badge({ label, tone = 'neutral', dot, size = 'sm' }: BadgeProps) {
  const { colors } = useTheme();
  const { fg, bg } = toneColors(colors, tone);
  const md = size === 'md';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: md ? 6 : 4,
        backgroundColor: bg,
        borderRadius: radius.full,
        paddingHorizontal: md ? 12 : 8,
        paddingVertical: md ? 6 : 3,
        alignSelf: 'flex-start',
        maxWidth: '100%',
      }}
    >
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} /> : null}
      <Text v={md ? 'small' : 'caption'} bold color={fg} numberOfLines={1} style={md ? null : { fontSize: 12, lineHeight: 16 }}>
        {label}
      </Text>
    </View>
  );
}
