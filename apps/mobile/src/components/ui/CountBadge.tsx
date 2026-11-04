import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

/** Kichik son belgisi (o'qilmaganlar soni); violet — mijozdan harakat kutayotgan buyurtmalar */
export function CountBadge({ count, tone = 'primary' }: { count: number; tone?: 'primary' | 'violet' }) {
  const { colors } = useTheme();
  if (!count) return null;
  return (
    <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: tone === 'violet' ? colors.violet : colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text v="caption" bold color={tone === 'violet' ? colors.background : colors.primaryForeground}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}
