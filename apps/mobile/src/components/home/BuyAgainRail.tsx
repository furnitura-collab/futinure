import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { ProductThumb } from '@/components/catalog/ProductThumb';
import { TileCard } from '@/components/catalog/TileCard';
import { IconButton, SectionHeader, Text } from '@/components/ui';
import { Grid } from '@/components/web/Grid';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { addQty, useAddToCart, useCart } from '@/lib/cart';
import { attrsText } from '@/lib/catalog';
import { useLayout, useSite } from '@/lib/layout';
import type { BuyAgainItem } from '@/lib/types';
import { space } from '@/theme';
import { Rail } from './Rail';

/** "Yana buyurtma qilish" — oldin olingan tovar, bir bosishda oxirgi miqdori bilan savatga */
export function BuyAgainRail() {
  const { t } = useI18n();
  const { site } = useSite();
  const { desktop } = useLayout();
  const q = useQuery({ queryKey: ['buy-again'], queryFn: () => api<BuyAgainItem[]>('/me/buy-again') });
  if (!q.data?.length) return null;
  return (
    <View style={{ gap: space(3) }}>
      <SectionHeader title={t('buyAgain')} />
      {site ? (
        <Grid columns={desktop ? 6 : 4}>
          {q.data.slice(0, desktop ? 12 : 8).map((i) => (
            <BuyAgainCard key={i.variantId} item={i} />
          ))}
        </Grid>
      ) : (
        <Rail>
          {q.data.map((i) => (
            <BuyAgainCard key={i.variantId} item={i} width={176} />
          ))}
        </Rail>
      )}
    </View>
  );
}

/** width — rail uchun qat'iy kenglik; berilmasa (saytda) to'r katagini to'ldiradi */
function BuyAgainCard({ item: i, width }: { item: BuyAgainItem; width?: number }) {
  const { t, name, money, unit } = useI18n();
  const cart = useCart();
  const add = useAddToCart();
  const p = i.product;
  const u = unit(p.unit);
  const last = `${i.lastQty} ${u}`;
  const inCart = cart.data?.lines.find((l) => l.variantId === i.variantId);

  return (
    <TileCard onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } })} accessibilityLabel={name(p)} style={{ width }}>
      <View style={{ height: 96 }}>
        <ProductThumb imageUrl={p.imageUrl} categoryId={p.categoryId} kind={p.kind} iconSize={28} />
      </View>
      <View style={{ padding: space(3), gap: 2 }}>
        <Text v="small" bold numberOfLines={2} style={{ minHeight: 36 }}>{name(p)}</Text>
        <Text v="caption" numberOfLines={1}>{attrsText(i.attributes) || ' '}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(2), marginTop: space(1) }}>
          <View style={{ flex: 1 }}>
            <Text bold numberOfLines={1}>{money(i.unitPrice)}</Text>
            <Text v="caption" numberOfLines={1}>{t('lastQty', { qty: last })}</Text>
          </View>
          <IconButton
            icon="plus"
            variant="primary"
            label={t('addLastQty', { qty: last })}
            disabled={i.stockLevel === 'OUT_OF_STOCK' || add.isPending}
            onPress={() => {
              const qty = addQty(inCart?.qty, i.lastQty);
              add.mutate({ variantId: i.variantId, qty, label: `${name(p)} — ${qty} ${u}` });
            }}
          />
        </View>
      </View>
    </TileCard>
  );
}
