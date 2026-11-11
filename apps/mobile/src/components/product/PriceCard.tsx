import { View } from 'react-native';
import type { StockLevel, Unit } from '@mebel/shared';
import { Badge, Card, Row, Text } from '@/components/ui';
import { useI18n, type I18nKey } from '@/i18n';
import { LEVEL_TONE } from '@/lib/catalog';
import type { ProductDetail } from '@/lib/types';
import { radius, space, useTheme, type Tone } from '@/theme';

type Variant = ProductDetail['variants'][number];

const STOCK: Record<StockLevel, { key: I18nKey }> = {
  IN_STOCK: { key: 'stockInStock' },
  LOW: { key: 'stockLow' },
  ON_ORDER: { key: 'stockOnOrder' },
  OUT_OF_STOCK: { key: 'stockOut' },
};

/** Narx bloki: birlik narxi, shaxsiy narx belgisi, pog'onalar jadvali va "qachon olasiz" jumlasi */
/** flat — saytdagi xarid blokining ichida (karta ichida karta bo'lmasin) */
export function PriceCard({ v, unitPrice, productUnit, quantity, flat }: { v: Variant; unitPrice: number; productUnit: Unit; quantity: string; flat?: boolean }) {
  const { t, money, unit } = useI18n();
  const { colors } = useTheme();
  const u = unit(productUnit);
  const stock = STOCK[v.stockLevel];
  const tone: Tone = LEVEL_TONE[v.stockLevel];
  // Joriy miqdorga mos eng katta pog'ona — jadvalda belgilanadi
  const Box = flat ? View : Card;
  const activeTier = v.tiers.filter((x) => Number(quantity) >= Number(x.minQty)).at(-1)?.minQty;

  return (
    <Box style={{ gap: space(3) }}>
      <View style={{ gap: space(1) }}>
        {v.groupPrice !== null && <Badge label={t('yourPrice')} tone="primary" />}
        <Row gap={space(2)} style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Text v="title">{money(unitPrice)}</Text>
          <Text muted>/ {u}</Text>
          {unitPrice < v.basePrice && <Text v="small" muted style={{ textDecorationLine: 'line-through' }}>{money(v.basePrice)}</Text>}
        </Row>
      </View>

      <Row gap={space(2)} style={{ alignItems: 'flex-start' }}>
        <Text v="small" bold tone={tone} style={{ flex: 1 }}>{t(stock.key, { days: v.leadTimeDays ?? '' })}</Text>
      </Row>

      {v.tiers.length > 0 && (
        <View style={{ gap: space(2) }}>
          <Row gap={6}>
            <Text v="small" bold>{t('priceTiers')}</Text>
          </Row>
          <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            {v.tiers.map((tier, i) => {
              const on = tier.minQty === activeTier;
              return (
                <Row
                  key={tier.minQty}
                  between
                  style={{ minHeight: 40, paddingHorizontal: space(3), backgroundColor: on ? colors.primarySoft : i % 2 ? colors.muted : colors.card }}
                >
                  <Text v="small" bold={on}>{t('tierFrom', { qty: `${tier.minQty} ${u}` })}</Text>
                  <Text v="small" bold>{money(tier.price)} / {u}</Text>
                </Row>
              );
            })}
          </View>
        </View>
      )}
    </Box>
  );
}
