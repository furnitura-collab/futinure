import { View } from 'react-native';
import { space } from '@/theme';
import { Card } from './Card';
import { Skeleton } from './Skeleton';

/** Ro'yxat ekranlari uchun tayyor skelet: bir nechta karta */
export function SkeletonList({ count = 5, lines = 2 }: { count?: number; lines?: number }) {
  return (
    <View style={{ gap: space(3) }}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} style={{ gap: space(2) }}>
          <Skeleton width="45%" height={16} />
          {Array.from({ length: lines }, (__, j) => (
            <Skeleton key={j} width={j % 2 ? '60%' : '85%'} height={12} />
          ))}
        </Card>
      ))}
    </View>
  );
}
