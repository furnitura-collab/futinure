import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useLayout } from '@/lib/layout';
import { space } from '@/theme';

/** CSS sticky — RN turlarida yo'q, lekin react-native-web uzatadi; sarlavha aylantirish konteyneridan tashqarida */
export const STICKY = { position: 'sticky', top: space(6) } as unknown as ViewStyle;

interface TwoColumnProps {
  children: ReactNode;
  aside: ReactNode;
  /** Filtr paneli — chapda, xulosa/harakat — o'ngda */
  side?: 'left' | 'right';
  asideWidth?: number;
  sticky?: boolean;
  mainStyle?: StyleProp<ViewStyle>;
}

/** Saytda asosiy kontent + yopishgan yon ustun (savat xulosasi, buyurtma holati, filtrlar) */
export function TwoColumn({ children, aside, side = 'right', asideWidth, sticky = true, mainStyle }: TwoColumnProps) {
  const { desktop } = useLayout();
  const column = (
    <View style={[{ width: asideWidth ?? (desktop ? 380 : 300), gap: space(4) }, sticky && STICKY]}>{aside}</View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: desktop ? space(8) : space(6) }}>
      {side === 'left' && column}
      {/* minWidth 0 — uzun matn ustunni kengaytirib, sahifani gorizontal surmasin */}
      <View style={[{ flex: 1, minWidth: 0, gap: space(4) }, mainStyle]}>{children}</View>
      {side === 'right' && column}
    </View>
  );
}
