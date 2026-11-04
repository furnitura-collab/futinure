import { Switch } from 'react-native';
import { useTheme } from '@/theme';
import { Row } from './Row';
import { Text } from './Text';

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { colors } = useTheme();
  return (
    <Row between style={{ minHeight: 44 }}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.primary, false: colors.input }}
        thumbColor={colors.card}
      />
    </Row>
  );
}
