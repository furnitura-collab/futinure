import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { SumRow } from '@/components/order/SumRow';
import { useI18n } from '@/i18n';
import type { Cart } from '@/lib/types';
import { space } from '@/theme';

/**
 * Savat xulosasi: tovarlar soni, og'irlik (transport uchun) va "keyin nima" izohi.
 * withTotal — saytdagi yon ustunda; telefonda jami summa pastki panelda turadi, takrorlanmaydi.
 */
export function CartSummary({ c, withTotal, action }: { c: Cart; withTotal?: boolean; action?: ReactNode }) {
  const { t, money } = useI18n();
  return (
    <Card style={{ gap: space(2) }}>
      <SumRow label={t('itemsCount', { n: c.count })} value={money(c.itemsTotal)} />
      {c.totalWeightKg > 0 && <SumRow label={t('weight')} value={`${c.totalWeightKg} ${t('kg')}`} />}
      {withTotal && <SumRow label={t('total')} value={money(c.itemsTotal)} bold />}
      <Text v="small" muted style={{ marginTop: space(1) }}>{t('managerConfirmsNote')}</Text>
      {action ? <View style={{ gap: space(2), marginTop: space(2) }}>{action}</View> : null}
    </Card>
  );
}
