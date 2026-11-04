import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { ProductThumb } from '@/components/catalog/ProductThumb';
import { IconButton, PressableScale, SectionHeader, Text } from '@/components/ui';
import { Grid } from '@/components/web/Grid';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { addQty, useAddToCart, useCart } from '@/lib/cart';
import { attrsText } from '@/lib/catalog';
import { useLayout, useSite } from '@/lib/layout';
import type { BuyAgainItem } from '@/lib/types';
import { makeStyles, radius, space, useTheme } from '@/theme';

/** "Yana buyurtma qilish" — oldin olingan tovar, bir bosishda oxirgi miqdori bilan savatga */
export function BuyAgainRail() {
  const { t } = useI18n();
  const { site } = useSite();
  const { desktop } = useLayout();
  const q = useQuery({ queryKey: ['buy-again'], queryFn: () => api<BuyAgainItem[]>('/me/buy-again') });
  if (!q.data?.length) return null;
  return (
    <View style={{ gap: space(3) }}>
      <SectionHeader title={t('buyAgain')} hint={t('buyAgainHint')} />
      {site ? (
        <Grid columns={desktop ? 6 : 4}>
          {q.data.slice(0, desktop ? 12 : 8).map((i) => (
            <BuyAgainCard key={i.variantId} item={i} fluid />
          ))}
        </Grid>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space(4) }} contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4), paddingBottom: space(1) }}>
          {q.data.map((i) => (
            <BuyAgainCard key={i.variantId} item={i} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** fluid — to'r katagini to'ldiradi (saytda), aks holda rail uchun qat'iy kenglik */
function BuyAgainCard({ item: i, fluid }: { item: BuyAgainItem; fluid?: boolean }) {
  const { t, name, money, unit } = useI18n();
  const s = useStyles();
  const { shadowLg } = useTheme();
  const cart = useCart();
  const add = useAddToCart();
  const p = i.product;
  const u = unit(p.unit);
  const inCart = cart.data?.lines.find((l) => l.variantId === i.variantId);

  return (
    <PressableScale onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } })} scale={0.98} accessibilityRole="link" accessibilityLabel={name(p)} hoverStyle={[shadowLg, { top: -2 }]} style={[s.card, fluid && { width: undefined }]}>
      <View style={s.image}>
        <ProductThumb imageUrl={p.imageUrl} categoryId={p.categoryId} kind={p.kind} iconSize={28} />
      </View>
      <View style={s.body}>
        <Text v="small" bold numberOfLines={2} style={{ minHeight: 36 }}>{name(p)}</Text>
        <Text v="caption" numberOfLines={1}>{attrsText(i.attributes) || ' '}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(2), marginTop: space(1) }}>
          <View style={{ flex: 1 }}>
            <Text v="small" bold numberOfLines={1}>{money(i.unitPrice)}</Text>
            <Text v="caption" numberOfLines={1}>{t('lastQty', { qty: `${i.lastQty} ${u}` })}</Text>
          </View>
          <IconButton
            icon="add"
            variant="primary"
            label={t('addLastQty', { qty: `${i.lastQty} ${u}` })}
            disabled={i.stockLevel === 'OUT_OF_STOCK' || add.isPending}
            onPress={() => {
              const qty = addQty(inCart?.qty, i.lastQty);
              add.mutate({ variantId: i.variantId, qty, label: `${name(p)} — ${qty} ${u}` });
            }}
          />
        </View>
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  card: { width: 176, backgroundColor: t.colors.card, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: t.colors.border, ...t.shadow },
  image: { height: 96 },
  body: { padding: space(3), gap: 2 },
}));
