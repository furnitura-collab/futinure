import { Linking } from 'react-native';
import { IconButton, Row } from '@/components/ui';
import { useI18n } from '@/i18n';
import { mapUrl } from '@/lib/driver';
import type { DriverDelivery } from '@/lib/types';
import { space } from '@/theme';

/** Xarita va qo'ng'iroq — katta, faqat ikonka (nomi ekran o'quvchi va tooltip'da) */
export function ContactActions({ order, size = 48 }: { order: DriverDelivery['order']; size?: number }) {
  const { t } = useI18n();
  const a = order.addressSnapshot;
  return (
    <Row gap={space(2)}>
      {a && <IconButton icon="map-trifold" label={t('drvMap')} variant="secondary" size={size} onPress={() => void Linking.openURL(mapUrl(a))} />}
      <IconButton icon="phone-call" label={t('drvCall')} variant="primary" size={size} onPress={() => void Linking.openURL(`tel:${order.customer.phone}`)} />
    </Row>
  );
}
