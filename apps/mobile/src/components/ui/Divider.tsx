import { StyleSheet, View } from 'react-native';
import { space, useTheme } from '@/theme';

export function Divider({ spacing = space(2) }: { spacing?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing }} />;
}
