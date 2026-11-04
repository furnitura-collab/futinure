import type { ReactNode } from 'react';
import { View } from 'react-native';
import { radius, space, toneColors, useTheme, type Tone } from '@/theme';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './Pressable';
import { Text } from './Text';

interface ListItemProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTone?: Tone;
  /** O'ng tomonda: qiymat, badge yoki boshqa element */
  right?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
}

export function ListItem({ title, subtitle, icon, iconTone = 'primary', right, onPress, destructive }: ListItemProps) {
  const { colors } = useTheme();
  const tone = toneColors(colors, destructive ? 'destructive' : iconTone);
  const body = (
    <>
      {icon ? (
        <View style={{ width: 36, height: 36, borderRadius: radius.sm + 2, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={18} color={tone.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text bold={!!subtitle} tone={destructive ? 'destructive' : undefined} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text v="small" muted numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
      {onPress && !destructive ? <Icon name="chevron-forward" size={18} color={colors.placeholder} /> : null}
    </>
  );
  const row = { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 56, paddingHorizontal: space(4), paddingVertical: space(3) } as const;

  if (!onPress) return <View style={row}>{body}</View>;
  return (
    <PressableScale onPress={onPress} scale={0.99} accessibilityRole="button" accessibilityLabel={title} hoverStyle={{ backgroundColor: colors.muted }} style={row}>
      {body}
    </PressableScale>
  );
}
