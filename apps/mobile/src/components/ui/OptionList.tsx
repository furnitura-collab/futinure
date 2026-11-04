import { View } from 'react-native';
import { space, useTheme } from '@/theme';
import { Icon } from './Icon';
import { PressableScale } from './Pressable';
import { Text } from './Text';

/** Sheet ichidagi bitta tanlov ro'yxati (saralash, til, mavzu) */
export function OptionList<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <PressableScale
            key={o.value}
            onPress={() => onChange(o.value)}
            scale={0.99}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 52, paddingVertical: space(2) }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text bold={on}>{o.label}</Text>
              {o.hint ? <Text v="caption">{o.hint}</Text> : null}
            </View>
            <Icon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? colors.primary : colors.input} />
          </PressableScale>
        );
      })}
    </View>
  );
}
