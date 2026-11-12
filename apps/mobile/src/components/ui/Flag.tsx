import { Image } from 'expo-image';
import type { Locale } from '@mebel/shared';

/**
 * Til bayrog'i (PNG, 3x). Android'ning rasm yuklovchisi `data:image/svg+xml` ni ko'rsatmaydi —
 * shuning uchun mobil ilovada SVG emas, shu SVG'lardan (packages/shared/src/flags.ts) olingan PNG'lar.
 */
const FLAGS: Record<Locale, number> = {
  uz: require('../../../assets/images/flags/uz.png'),
  ru: require('../../../assets/images/flags/ru.png'),
  en: require('../../../assets/images/flags/en.png'),
};

/** small — ilova sarlavhasidagi ixcham tugmalar uchun (20×14) */
export function Flag({ locale, small }: { locale: Locale; small?: boolean }) {
  const size = small ? { width: 20, height: 14 } : { width: 24, height: 16 };
  return <Image source={FLAGS[locale]} style={{ ...size, borderRadius: 2 }} contentFit="cover" accessible={false} />;
}
