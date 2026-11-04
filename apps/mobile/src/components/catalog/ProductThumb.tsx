import { Image } from 'expo-image';
import type { ImageStyle, StyleProp, ViewStyle } from 'react-native';
import { imageUri } from '@/lib/catalog';
import { CategoryArt } from './CategoryArt';

/** Mahsulot rasmi yoki (rasm bo'lmasa) kategoriya illyustratsiyasi */
export function ProductThumb({
  imageUrl,
  categoryId,
  kind,
  iconSize,
  style,
}: {
  imageUrl: string | null | undefined;
  categoryId: string | null | undefined;
  kind?: string | null;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const uri = imageUri(imageUrl ?? null);
  if (uri) return <Image source={{ uri }} style={[{ flex: 1 }, style as StyleProp<ImageStyle>]} contentFit="cover" transition={200} />;
  return <CategoryArt categoryId={categoryId} kind={kind} iconSize={iconSize} style={style} />;
}
