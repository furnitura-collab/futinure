import { View } from 'react-native';
import { radius, useTheme } from '@/theme';
import { Text } from './Text';

const initials = (name: string | null | undefined) =>
  (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

/** Ism bosh harflari bilan doira — profil kartasi va sayt sarlavhasidagi hisob tugmasi */
export function Avatar({ name, size = 56 }: { name: string | null | undefined; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text v={size >= 48 ? 'heading' : 'small'} bold={size < 48} color={colors.primaryForeground}>
        {initials(name)}
      </Text>
    </View>
  );
}
