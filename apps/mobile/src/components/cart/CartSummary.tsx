import { Card, Icon, Row, Text } from '@/components/ui';
import { SumRow } from '@/components/order/SumRow';
import { useI18n } from '@/i18n';
import type { Cart } from '@/lib/types';
import { space } from '@/theme';

/** Savat xulosasi: tovarlar soni, og'irlik (transport uchun), jami va "keyin nima" izohi */
export function CartSummary({ c }: { c: Cart }) {
  const { t, money } = useI18n();
  return (
    <Card style={{ gap: space(2) }}>
      <Text v="h2">{t('summary')}</Text>
      <SumRow label={t('itemsCount', { n: c.count })} value={money(c.itemsTotal)} />
      {c.totalWeightKg > 0 && <SumRow label={t('weight')} value={`${c.totalWeightKg} ${t('kg')}`} />}
      <SumRow label={t('total')} value={money(c.itemsTotal)} bold />
      <Row gap={space(2)} style={{ alignItems: 'flex-start', marginTop: space(1) }}>
        <Icon name="information-circle-outline" size={18} tone="info" />
        <Text v="small" muted style={{ flex: 1 }}>{t('managerConfirmsNote')}</Text>
      </Row>
    </Card>
  );
}
