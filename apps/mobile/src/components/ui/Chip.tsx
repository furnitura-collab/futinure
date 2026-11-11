import { radius, space, useTheme } from '@/theme';
import { PressableScale } from './Pressable';
import { Text } from './Text';

/** Filtr tugmasi — faqat matn */
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const fg = active ? colors.primaryForeground : colors.foreground;
  return (
    <PressableScale
      onPress={onPress}
      scale={0.95}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      hoverStyle={active ? null : { borderColor: colors.primary }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 36,
        paddingHorizontal: space(4),
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primary : colors.card,
      }}
    >
      <Text v="small" bold color={fg} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}
