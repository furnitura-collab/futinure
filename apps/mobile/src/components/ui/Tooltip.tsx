import { Platform, View } from 'react-native';
import { radius, space, useTheme } from '@/theme';
import { Text } from './Text';

/** Web: sichqoncha ustida — kichik nom (ikonkali tugmalar uchun). Telefonda hover yo'q — accessibilityLabel yetarli */
export function Tooltip({ label, visible }: { label: string; visible: boolean }) {
  const { colors } = useTheme();
  if (Platform.OS !== 'web' || !visible) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: '100%',
        marginTop: space(1.5),
        alignSelf: 'center',
        zIndex: 50,
        paddingHorizontal: space(2),
        paddingVertical: space(1),
        borderRadius: radius.sm,
        backgroundColor: colors.foreground,
      }}
    >
      <Text v="caption" color={colors.background} numberOfLines={1} style={{ fontSize: 11, lineHeight: 14 }}>
        {label}
      </Text>
    </View>
  );
}
