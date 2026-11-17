import type { OrderStatus } from '@mebel/shared';
import { Button, Text } from '@/components/ui';
import { useI18n } from '@/i18n';

export const WITH_ACTIONS: OrderStatus[] = ['READY', 'OUT_FOR_DELIVERY', 'PREPARING'];

interface DeliveryActionsProps {
  status: OrderStatus;
  starting: boolean;
  onStart: () => void;
  onDeliver: () => void;
  onFail: () => void;
}

/** Har bosqichda bitta asosiy amal: yo'lga chiqish → topshirish (muqobil — yetkazib bo'lmadi) */
export function DeliveryActions({ status, starting, onStart, onDeliver, onFail }: DeliveryActionsProps) {
  const { t } = useI18n();
  switch (status) {
    case 'READY':
      return <Button title={t('drvStart')} block loading={starting} onPress={onStart} />;
    case 'OUT_FOR_DELIVERY':
      return (
        <>
          <Button title={t('drvDeliver')} block onPress={onDeliver} />
          <Button title={t('drvFail')} block variant="outline" size="md" onPress={onFail} />
        </>
      );
    case 'PREPARING':
      return (
        <Text muted center>
          {t('drvNotReady')}
        </Text>
      );
    default:
      return null;
  }
}
