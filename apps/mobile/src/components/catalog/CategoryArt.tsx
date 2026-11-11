import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '@/components/ui';
import { useCategoryVisual } from '@/lib/categories';
import { useTheme } from '@/theme';

interface CategoryArtProps {
  categoryId: string | null | undefined;
  kind?: string | null;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Rasm yo'q mahsulot uchun o'rinbosar: kategoriya rangidagi tinch fon va kichik belgi.
 * Bezak shakllarisiz — kartochkada asosiy narsa nom va narx, rasm o'rni e'tiborni tortmasin.
 */
export function CategoryArt({ categoryId, kind, iconSize = 32, style }: CategoryArtProps) {
  const { colors } = useTheme();
  const visual = useCategoryVisual()(categoryId, kind);
  const tint = colors.tints[visual.tint % colors.tints.length]!;
  return (
    <View style={[{ flex: 1, backgroundColor: tint.bg, alignItems: 'center', justifyContent: 'center' }, style]} accessible={false}>
      <Icon name={visual.icon} size={iconSize} color={tint.fg} />
    </View>
  );
}
