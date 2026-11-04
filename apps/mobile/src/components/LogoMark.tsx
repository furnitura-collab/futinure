import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from '@/components/ui/Text';

/** Brend belgisi — "M" kvadrat (kirish ekrani, sayt sarlavhasi va pastki qismi) */
/** inverse — rangli (primary) fon ustida: oq kvadrat, rangli harf */
export function LogoMark({ size = 36, raised, inverse }: { size?: number; raised?: boolean; inverse?: boolean }) {
  const { colors, shadowLg } = useTheme();
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: Math.round(size / 3), backgroundColor: inverse ? colors.card : colors.primary, alignItems: 'center', justifyContent: 'center' },
        raised && shadowLg,
      ]}
    >
      <Text v={size >= 64 ? 'display' : size >= 40 ? 'heading' : 'body'} bold={size < 40} color={inverse ? colors.accentForeground : colors.primaryForeground}>
        M
      </Text>
    </View>
  );
}
