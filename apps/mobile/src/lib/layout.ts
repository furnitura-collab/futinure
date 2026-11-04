import { useWindowDimensions, type ViewStyle } from 'react-native';

/** Ekran kengligi chegaralari (web va planshet) */
export const BREAKPOINT = { wide: 768, desktop: 1024 } as const;

/** Kontentning eng katta kengligi — keng ekranda markazda turadi */
export const CONTENT = { form: 560, page: 760, wide: 1280 } as const;

export function useLayout() {
  const { width } = useWindowDimensions();
  return { width, wide: width >= BREAKPOINT.wide, desktop: width >= BREAKPOINT.desktop };
}

/** Telefonda ta'siri yo'q (ekran torroq), keng ekranda kontentni markazga oladi */
export const contained = (maxWidth: number): ViewStyle => ({ width: '100%', maxWidth, alignSelf: 'center' });

/** Katalog kartochkasining eng kichik kengligi — shundan ustunlar soni chiqadi */
const CARD_MIN = 200;
export const gridColumns = (width: number) => Math.min(6, Math.max(2, Math.floor(width / CARD_MIN)));
