import { View } from 'react-native';
import { Icon, PressableScale, Text, type IconName } from '@/components/ui';
import { radius, space, useTheme } from '@/theme';

interface OptionCardProps {
  selected: boolean;
  onPress: () => void;
  title: string;
  subtitle?: string;
  icon?: IconName;
}

/** Radio-karta: yetkazish usuli, manzil yoki ombor tanlash */
export function OptionCard({ selected, onPress, title, subtitle, icon }: OptionCardProps) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      scale={0.985}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={title}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space(3),
        padding: space(4),
        borderRadius: radius.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primarySoft : colors.card,
      }}
    >
      {icon ? (
        <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: selected ? colors.card : colors.muted, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} color={selected ? colors.accentForeground : colors.mutedForeground} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text bold>{title}</Text>
        {subtitle ? <Text v="small" muted>{subtitle}</Text> : null}
      </View>
      <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.primary : colors.placeholder} />
    </PressableScale>
  );
}
