import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '@/components/ui';
import { useCategoryVisual } from '@/lib/categories';
import { useTheme } from '@/theme';

interface CategoryArtProps {
  categoryId: string | null | undefined;
  kind?: string | null;
  /** Markaziy belgi o'lchami — qolgan shakllar shunga nisbatan */
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Rasm yo'q mahsulot uchun illyustratsiya: kategoriya rangidagi fon, yumshoq shakllar
 * va kategoriya belgisi. Bo'sh kulrang quti o'rniga — "bu nima tovar" bir qarashda bilinadi.
 */
export function CategoryArt({ categoryId, kind, iconSize = 40, style }: CategoryArtProps) {
  const { colors } = useTheme();
  const visual = useCategoryVisual()(categoryId, kind);
  const tint = colors.tints[visual.tint % colors.tints.length]!;
  const disc = iconSize * 2;
  return (
    <View style={[{ flex: 1, backgroundColor: tint.bg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]} accessible={false}>
      <View style={{ position: 'absolute', width: disc * 1.6, height: disc * 1.6, borderRadius: disc, backgroundColor: tint.shape, top: -disc * 0.7, right: -disc * 0.6 }} />
      <View
        style={{ position: 'absolute', width: disc * 0.9, height: disc * 0.9, borderRadius: iconSize * 0.4, backgroundColor: tint.shape, bottom: -disc * 0.3, left: -disc * 0.2, transform: [{ rotate: '18deg' }] }}
      />
      <View style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', opacity: 0.92 }}>
        <Icon name={visual.icon} size={iconSize} color={tint.fg} />
      </View>
    </View>
  );
}
