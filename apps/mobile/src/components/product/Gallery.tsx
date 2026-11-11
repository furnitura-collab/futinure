import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { CategoryArt } from '@/components/catalog/CategoryArt';
import { imageUri } from '@/lib/catalog';
import { radius, space, useTheme } from '@/theme';

/** Rasmlar karuseli: kenglik konteynerdan olinadi; rasm yo'q bo'lsa — kategoriya illyustratsiyasi. square — saytda katta kvadrat */
export function Gallery({ images, categoryId, kind, square }: { images: { id: string; url: string }[]; categoryId: string; kind: string; square?: boolean }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const height = square ? width : Math.min(width * 0.75, 420);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ backgroundColor: colors.muted, borderRadius: radius.xl, overflow: 'hidden' }}>
      {images.length ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => width && setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {images.map((img) => (
            <Image key={img.id} source={{ uri: imageUri(img.url)! }} style={{ width, height }} contentFit="cover" transition={200} />
          ))}
        </ScrollView>
      ) : (
        <View style={{ height: square ? width : 220 }}>
          <CategoryArt categoryId={categoryId} kind={kind} iconSize={square ? 64 : 48} />
        </View>
      )}
      {images.length > 1 && (
        <View style={{ position: 'absolute', bottom: space(3), alignSelf: 'center', flexDirection: 'row', gap: 6 }}>
          {images.map((img, i) => (
            <View key={img.id} style={{ width: i === page ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? colors.primary : colors.glass }} />
          ))}
        </View>
      )}
    </View>
  );
}
