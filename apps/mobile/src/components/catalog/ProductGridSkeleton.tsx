import { View } from 'react-native';
import { Skeleton } from '@/components/ui';
import { radius, space } from '@/theme';

/** Mahsulot to'ri yuklanayotganda — karta shaklidagi o'rinbosarlar (sakrashsiz) */
export function ProductGridSkeleton({ columns, cardWidth }: { columns: number; cardWidth: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
      {Array.from({ length: columns * 2 }, (_, i) => (
        <View key={i} style={{ width: cardWidth, gap: space(2) }}>
          <Skeleton height={cardWidth * 0.75} radius={radius.lg} />
          <Skeleton width="80%" height={14} />
          <Skeleton width="50%" height={14} />
        </View>
      ))}
    </View>
  );
}
