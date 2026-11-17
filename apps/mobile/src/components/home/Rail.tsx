import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { space } from '@/theme';

/** Telefonda gorizontal kartalar qatori: ekran chetigacha aylanadi, birinchi karta sahifa chizig'ida */
export function Rail({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -space(4) }}
      contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4), paddingBottom: space(1) }}
    >
      {children}
    </ScrollView>
  );
}
