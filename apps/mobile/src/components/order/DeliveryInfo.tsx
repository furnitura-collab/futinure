import { View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { OrderDetail } from '@/lib/types';
import { space } from '@/theme';

/** Qayerga / qayerdan: manzil yoki ombor va mijoz izohi (reja sanasi — sarlavha kartasida) */
export function DeliveryInfo({ o }: { o: OrderDetail }) {
  const { t } = useI18n();
  const w = o.pickupWarehouse;
  return (
    <Card style={{ gap: space(2) }}>
      <Text v="small" muted>{w ? t('pickupFrom') : t('deliveryTo')}</Text>
      <View style={{ gap: 2 }}>
        <Text bold>{w?.name ?? o.addressSnapshot?.addressText}</Text>
        {w && <Text v="small" muted>{[w.addressText, w.workHours].filter(Boolean).join(' · ')}</Text>}
      </View>
      {o.customerComment ? <Text v="small" muted>{`${t('yourComment')}: ${o.customerComment}`}</Text> : null}
    </Card>
  );
}
