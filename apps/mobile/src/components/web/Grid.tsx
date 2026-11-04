import { Children, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { space } from '@/theme';

/** Teng ustunli to'r: kartalar kesilib qolmaydi (gorizontal "rail" o'rniga) */
export function Grid({ columns, gap = space(3), children }: { columns: number; gap?: number; children: ReactNode }) {
  const width = `${100 / columns}%` as const;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -gap / 2 }}>
      {Children.toArray(children)
        .filter(isValidElement)
        .map((child, i) => (
          <View key={child.key ?? i} style={{ width, padding: gap / 2 }}>
            {child}
          </View>
        ))}
    </View>
  );
}
