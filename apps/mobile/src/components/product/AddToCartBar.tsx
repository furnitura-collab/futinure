import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, QtyStepper, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { ProductDetail } from '@/lib/types';
import { space } from '@/theme';
import type { ProductPurchase } from './useProductPurchase';

/** Pastki panel: miqdor (birlik bilan), jonli jami summa va asosiy tugma */
export function AddToCartBar({ p, buy, onAdded }: { p: ProductDetail; buy: ProductPurchase; onAdded?: () => void }) {
  const { t, money, unit } = useI18n();
  const u = unit(p.unit);
  if (!buy.orderable || !buy.price) {
    return <Button title={t('outOfStockNow')} disabled block onPress={() => undefined} />;
  }
  const same = buy.inCart?.qty === buy.quantity;
  return (
    <>
      <Row between style={{ flexWrap: 'wrap', rowGap: space(2) }}>
        <QtyStepper value={buy.quantity} onChange={buy.setQty} step={Number(p.qtyStep)} min={Number(p.minQty)} unit={u} />
        <View style={{ alignItems: 'flex-end' }}>
          <Text v="caption">{t('lineTotal')}</Text>
          <Text v="heading">{buy.price.ok ? money(buy.price.total) : '—'}</Text>
        </View>
      </Row>
      {!buy.price.ok && <Text v="caption" tone="destructive">{t('qtyRule', { min: `${p.minQty} ${u}`, step: `${p.qtyStep} ${u}` })}</Text>}
      {buy.inCart && same ? (
        <Button title={t('inCartOpen', { qty: `${buy.inCart.qty} ${u}` })} variant="secondary" block onPress={() => router.navigate('/cart')} />
      ) : (
        <Button
          title={buy.inCart ? t('inCartUpdate', { qty: `${buy.inCart.qty} ${u}` }) : t('addToCart')}
          block
          disabled={!buy.price.ok}
          loading={buy.pending}
          onPress={() => buy.submit(onAdded)}
        />
      )}
    </>
  );
}
