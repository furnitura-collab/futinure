import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { motion } from '@/theme';

/** Ro'yxat elementi/kartaning paydo bo'lishi: pastdan yengil ko'tarilib (birinchi 8 tasi navbat bilan) */
export function Appear({ children, index = 0, style }: { children: ReactNode; index?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.duration(motion.slow).delay(Math.min(index, 8) * 40)} style={style}>
      {children}
    </Animated.View>
  );
}
