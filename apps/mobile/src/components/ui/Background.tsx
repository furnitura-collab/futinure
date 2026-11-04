import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';

/** Ilova foni — tekis, deyarli oq (kontent kartalari undan soya va chegara bilan ajraladi) */
export function Background() {
  const { colors } = useTheme();
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />;
}
