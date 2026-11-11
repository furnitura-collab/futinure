import { router } from 'expo-router';
import { View } from 'react-native';
import { Badge, IconButton, PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { addQty, useAddToCart, useCart } from '@/lib/cart';
import { LEVEL_TONE } from '@/lib/catalog';
import type { ProductCard as Product } from '@/lib/types';
import { makeStyles, radius, space, useTheme } from '@/theme';
import { ProductThumb } from './ProductThumb';

/** Bitta bosishda qo'shib bo'ladimi: yagona variant va 1 dona qadam (aks holda — tanlash oynasi) */
export const canQuickAdd = (p: Product) => !!p.variantId && Number(p.minQty) === 1 && Number(p.qtyStep) === 1;

export function ProductCard({ p, width, onQuickAdd }: { p: Product; width: number; onQuickAdd: (p: Product) => void }) {
  const { t, name, money, level, unit } = useI18n();
  const s = useStyles();
  const { shadowLg } = useTheme();
  const cart = useCart();
  const add = useAddToCart();
  const price = money(p.priceFrom);
  const inCart = cart.data?.lines.find((l) => l.productId === p.id);
  const out = p.stockLevel === 'OUT_OF_STOCK';

  const onAdd = () => {
    if (!canQuickAdd(p)) return onQuickAdd(p);
    const qty = addQty(inCart?.qty, '1');
    add.mutate({ variantId: p.variantId!, qty, label: `${name(p)} — ${qty} ${unit(p.unit)}` });
  };

  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } })}
      scale={0.98}
      accessibilityRole="link"
      accessibilityLabel={name(p)}
      hoverStyle={[shadowLg, { top: -2 }]}
      style={[s.card, { width, flex: 1 }]}
    >
      <View style={s.image}>
        <ProductThumb imageUrl={p.imageUrl} categoryId={p.categoryId} kind={p.kind} iconSize={Math.max(24, Math.min(36, width / 6))} />
        {/* "Bor" — odatiy holat, belgisiz; faqat kam/tugagan/buyurtmaga ko'rsatiladi */}
        {p.stockLevel !== 'IN_STOCK' && (
          <View style={s.badge}>
            <Badge label={level(p.stockLevel)} tone={LEVEL_TONE[p.stockLevel]} dot />
          </View>
        )}
        {inCart && (
          <View style={s.inCart}>
            <Badge label={`${inCart.qty} ${unit(p.unit)}`} tone="primary" />
          </View>
        )}
        {/* "+" rasm burchagida — narx uchun to'liq kenglik qoladi */}
        <View style={s.add}>
          <IconButton icon="add" variant="primary" size={44} label={t('addToCartOf', { name: name(p) })} disabled={out || add.isPending} onPress={onAdd} />
        </View>
      </View>
      <View style={s.body}>
        <Text v="small" bold numberOfLines={2} style={{ minHeight: 36 }}>{name(p)}</Text>
        <Text v="caption" numberOfLines={1} style={s.brand}>{p.brand?.name}</Text>
        <View style={{ marginTop: space(1) }}>
          <Text bold numberOfLines={1} adjustsFontSizeToFit>{p.variantCount > 1 ? t('priceFrom', { price }) : price}</Text>
          <Text v="caption" numberOfLines={1}>
            {p.priceFrom < p.basePriceFrom ? <Text v="caption" style={{ textDecorationLine: 'line-through' }}>{money(p.basePriceFrom)} </Text> : null}
            {t('perUnit', { unit: unit(p.unit) })}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: t.colors.border,
    ...t.shadow,
  },
  image: { aspectRatio: 4 / 3, backgroundColor: t.colors.muted },
  badge: { position: 'absolute', top: space(2), left: space(2) },
  inCart: { position: 'absolute', bottom: space(2), left: space(2) },
  add: { position: 'absolute', bottom: space(2), right: space(2), borderRadius: radius.full, ...t.shadow },
  body: { padding: space(3), paddingTop: space(2), gap: 2 },
  // Brendsiz kartochkada ham narx qatori boshqalari bilan bir chiziqda
  brand: { minHeight: 18 },
}));
