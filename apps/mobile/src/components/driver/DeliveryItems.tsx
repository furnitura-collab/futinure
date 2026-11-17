import { View } from 'react-native';
import { Card, Divider, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { DriverDelivery } from '@/lib/types';
import { space } from '@/theme';

/** Olib boriladigan tovarlar: nomi, kodi va miqdori */
export function DeliveryItems({ order: o }: { order: DriverDelivery['order'] }) {
  const { t, name, unit } = useI18n();
  if (!o.items?.length) return null;
  return (
    <View style={{ gap: space(2) }}>
      <Text v="small" bold>
        {t('drvItems')} ({o.itemsCount}) · {o.totalWeightKg} {t('kg')}
      </Text>
      <Card style={{ paddingVertical: space(1) }}>
        {o.items.map((i, idx) => (
          <View key={i.id}>
            {idx > 0 && <Divider spacing={0} />}
            <Row between gap={space(3)} style={{ paddingVertical: space(3), alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text v="small">{name(i)}</Text>
                <Text v="caption">{[i.sku, Object.values(i.attributes).join(', ')].filter(Boolean).join(' · ')}</Text>
              </View>
              <Text bold>
                {i.qty} {unit(i.unit)}
              </Text>
            </Row>
          </View>
        ))}
      </Card>
    </View>
  );
}
