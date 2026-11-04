import { View } from 'react-native';
import { attributeLabel, attributeValue } from '@mebel/shared';
import { Card, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { ProductDetail } from '@/lib/types';
import { space, useTheme } from '@/theme';

/** Xususiyatlar jadvali (Grainger/McMaster uslubida): o'lcham, og'irlik, birlik, minimal buyurtma */
export function SpecsTable({ p, v }: { p: ProductDetail; v: ProductDetail['variants'][number] }) {
  const { t, locale, unit, name } = useI18n();
  const { colors } = useTheme();
  const u = unit(p.unit);
  const weight = p.weightKg && Number(p.weightKg) > 0 ? `${Number(p.weightKg)} ${t('kg')} / ${u}` : null;
  const rows = (
    [
      [t('specSku'), v.sku],
      [t('specBrand'), p.brand?.name],
      [t('specCategory'), name(p.category)],
      [t('specSize'), p.board && `${p.board.lengthMm} × ${p.board.widthMm} mm`],
      ...Object.entries(v.attributes).map(([k, x]) => [attributeLabel(k, locale), attributeValue(k, x)]),
      [t('specWeight'), weight],
      [t('specUnit'), u],
      [t('specMinQty'), `${p.minQty} ${u}`],
      [t('specStep'), Number(p.qtyStep) !== 1 && `${p.qtyStep} ${u}`],
    ] as [string, string | null | undefined | false][]
  ).filter((r): r is [string, string] => !!r[1]);
  return (
    <Card style={{ gap: space(2) }}>
      <Text v="h2">{t('specs')}</Text>
      <View>
        {rows.map(([k, val], i) => (
          <Row key={k} between style={{ minHeight: 40, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, alignItems: 'center' }}>
            <Text v="small" muted style={{ flex: 1 }}>{k}</Text>
            <Text v="small" bold style={{ flex: 1, textAlign: 'right' }}>{val}</Text>
          </Row>
        ))}
      </View>
    </Card>
  );
}
