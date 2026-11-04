import { useEffect } from 'react';
import { type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { radius as R, useTheme } from '@/theme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Kontent yuklanayotganda — spinner o'rniga shakl (sahifa "sakramaydi") */
export function Skeleton({ width = '100%', height = 16, radius = R.sm, style }: SkeletonProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    if (!reduced) pulse.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [pulse, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.muted }, animated, style]} />;
}
