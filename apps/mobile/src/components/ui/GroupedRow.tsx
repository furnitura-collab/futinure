import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { PressableScale } from './Pressable';
import { radius, space, useTheme } from '@/theme';

interface GroupedRowProps {
  index: number;
  count: number;
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** Ixcham ro'yxat qatori: FlatList elementlari bitta yaxlit karta bo'lib ko'rinadi (ajratgich — ingichka chiziq) */
export function GroupedRow({ index, count, children, onPress, accessibilityLabel }: GroupedRowProps) {
  const { colors } = useTheme();
  const first = index === 0;
  const last = index === count - 1;
  const style: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(3),
    paddingVertical: space(3),
    paddingHorizontal: space(4),
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: last ? StyleSheet.hairlineWidth : 0,
    borderTopLeftRadius: first ? radius.lg : 0,
    borderTopRightRadius: first ? radius.lg : 0,
    borderBottomLeftRadius: last ? radius.lg : 0,
    borderBottomRightRadius: last ? radius.lg : 0,
  };
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <PressableScale onPress={onPress} scale={0.995} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hoverStyle={{ backgroundColor: colors.muted }} style={style}>
      {children}
    </PressableScale>
  );
}
