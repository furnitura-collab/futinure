import { formatDate } from '@mebel/shared';
import { View } from 'react-native';
import { Card, Icon, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { OrderDetail } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

/** Qayerga / qayerdan: manzil yoki ombor, sana va izoh */
export function DeliveryInfo({ o }: { o: OrderDetail }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const pickup = o.deliveryType === 'PICKUP';
  return (
    <Card style={{ gap: space(3) }}>
      <Text v="h2">{pickup ? t('pickupFrom') : t('deliveryTo')}</Text>
      <Row gap={space(3)} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={pickup ? 'storefront-outline' : 'car-outline'} size={20} color={colors.accentForeground} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text bold>{o.pickupWarehouse?.name ?? o.addressSnapshot?.addressText}</Text>
          {o.pickupWarehouse && <Text v="small" muted>{[o.pickupWarehouse.addressText, o.pickupWarehouse.workHours].filter(Boolean).join(' · ')}</Text>}
          {o.deliveryDate && <Text v="small">{t('plannedDate', { date: formatDate(o.deliveryDate) })}</Text>}
        </View>
      </Row>
      {o.customerComment ? (
        <Text v="small" muted>
          {t('yourComment')}: {o.customerComment}
        </Text>
      ) : null}
    </Card>
  );
}
