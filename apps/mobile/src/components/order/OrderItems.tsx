import { View } from 'react-native';
import { Card, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { attrsLabeled } from '@/lib/catalog';
import type { OrderDetail } from '@/lib/types';
import { space, useTheme } from '@/theme';

/** Tovarlar: nom, variant (nomlari bilan), miqdor × narx = summa */
export function OrderItems({ o }: { o: OrderDetail }) {
  const { t, money, name, unit, locale } = useI18n();
  const { colors } = useTheme();
  return (
    <Card style={{ gap: space(1) }}>
      <Text v="h2">{t('itemsTitle', { n: o.items.length })}</Text>
      {o.items.map((i, idx) => (
        <View key={i.id} style={{ gap: 2, paddingVertical: space(3), borderTopWidth: idx ? 1 : 0, borderTopColor: colors.border }}>
          <Row between style={{ alignItems: 'flex-start' }}>
            <Text bold style={{ flex: 1 }}>{name(i)}</Text>
            <Text bold>{money(i.lineTotal)}</Text>
          </Row>
          {Object.keys(i.attributes).length > 0 && <Text v="caption">{attrsLabeled(i.attributes, locale)}</Text>}
          <Text v="small" muted>
            {i.qty} {unit(i.unit)} × {money(i.unitPrice)}
          </Text>
          {i.requestedQty !== i.qty && <Text v="caption" tone="warning">{t('qtyChanged', { from: i.requestedQty, to: i.qty })}</Text>}
        </View>
      ))}
    </Card>
  );
}
