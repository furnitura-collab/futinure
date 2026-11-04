import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export function Row({ children, style, gap = 8, between }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number; between?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, between && { justifyContent: 'space-between' }, style]}>{children}</View>;
}
