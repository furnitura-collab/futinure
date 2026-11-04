import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { space, useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export function EmptyState({ icon, title, hint, action }: { icon: IconName; title: string; hint?: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(250)} style={{ alignItems: 'center', paddingVertical: space(12), paddingHorizontal: space(6), gap: space(3) }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: space(1) }}>
        <Icon name={icon} size={32} color={colors.accentForeground} />
      </View>
      <Text v="h2" center>{title}</Text>
      {hint ? <Text muted center style={{ maxWidth: 320 }}>{hint}</Text> : null}
      {action ? <View style={{ marginTop: space(2) }}>{action}</View> : null}
    </Animated.View>
  );
}
