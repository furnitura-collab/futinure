import { radius, space, useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './Pressable';
import { Text } from './Text';

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: IconName }) {
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
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <Text v="small" bold color={fg} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}
