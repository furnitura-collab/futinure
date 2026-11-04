import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { motion, radius, useTheme } from '@/theme';
import { PressableScale } from './Pressable';
import { Text } from './Text';

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  accessibilityLabel?: string;
}

/** Bir nechta variantdan bittasini tanlash — tanlangan fon silliq suriladi */
export function Segmented<T extends string>({ value, options, onChange, accessibilityLabel }: SegmentedProps<T>) {
  const { colors, shadow } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segment = width ? (width - 8) / options.length : 0;

  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(index * segment, { duration: motion.base }) }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', backgroundColor: colors.muted, borderRadius: radius.md, padding: 4 }}
    >
      {segment > 0 && (
        <Animated.View
          style={[
            { position: 'absolute', top: 4, bottom: 4, left: 4, width: segment, borderRadius: radius.sm, backgroundColor: colors.card },
            shadow,
            thumb,
          ]}
        />
      )}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <PressableScale
            key={o.value}
            onPress={() => onChange(o.value)}
            scale={0.96}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, minHeight: 36, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text v="small" bold color={on ? colors.foreground : colors.mutedForeground} numberOfLines={1}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
