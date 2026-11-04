import { useState } from 'react';
import { Pressable as RNPressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { motion } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Bosilganda kichrayish darajasi */
  scale?: number;
  /** Sichqoncha ustida turganda (web) — fon/soya o'zgarishi */
  hoverStyle?: StyleProp<ViewStyle>;
}

/** Bosilganda yumshoq kichrayadigan Pressable (Reanimated) — hamma bosiladigan yuzalar uchun */
export function PressableScale({ style, scale = 0.97, hoverStyle, onPressIn, onPressOut, onHoverIn, onHoverOut, disabled, ...rest }: PressableScaleProps) {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);
  const [hovered, setHovered] = useState(false);
  // Opacity shu yerda: animatsiya stili oddiy `style.opacity`ni bosib ketadi
  const base = disabled ? 0.45 : 1;
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scale) }],
    opacity: base * (1 - pressed.value * 0.08),
  }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (!reduced) pressed.value = withTiming(1, { duration: motion.fast });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withTiming(0, { duration: motion.base });
        onPressOut?.(e);
      }}
      onHoverIn={(e) => {
        if (hoverStyle) setHovered(true);
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        setHovered(false);
        onHoverOut?.(e);
      }}
      style={[style, hovered && !disabled ? hoverStyle : null, animated]}
    />
  );
}
