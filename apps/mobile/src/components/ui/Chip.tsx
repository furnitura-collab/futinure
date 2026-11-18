import { radius, space, useTheme } from '@/theme';
import { Icon } from './Icon';
import { PressableScale } from './Pressable';
import { Text } from './Text';

/** Filtr tugmasi (matn). caret — tanlash oynasini ochadi (select kabi); grow — qatordagi joyni bo'lishadi, sig'masa matn qisqartiriladi */
export function Chip({ label, active, caret, grow, onPress }: { label: string; active?: boolean; caret?: boolean; grow?: boolean; onPress: () => void }) {
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
        gap: grow ? 4 : 6,
        height: 36,
        paddingHorizontal: grow ? 10 : space(4),
        // Matn o'lchamidan boshlanadi, bo'sh joyni bo'lishadi; sig'masa — qisqaradi
        ...(grow && { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0, justifyContent: 'center' }),
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primary : colors.card,
      }}
    >
      <Text v="small" bold color={fg} numberOfLines={1} style={grow ? { flexShrink: 1 } : undefined}>
        {label}
      </Text>
      {caret && <Icon name="caret-down" size={14} color={fg} />}
    </PressableScale>
  );
}
