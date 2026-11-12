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

export function Flag({ locale }: { locale: Locale }) {
  return <Image source={FLAGS[locale]} style={{ width: 24, height: 16, borderRadius: 2 }} contentFit="cover" accessible={false} />;
}
