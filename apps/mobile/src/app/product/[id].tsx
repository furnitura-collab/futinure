import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lineTotal, resolveUnitPrice, validateQty } from '@mebel/shared';
import { Badge, Button, Card, ErrorView, Ionicons, Loader, QtyStepper, Row, Text, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { useCart, useSetCartItem } from '../../lib/cart';
import { som } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { colors, radius, space } from '../../lib/theme';
import type { ProductDetail } from '../../lib/types';
import { attrsText, imageUri, LEVEL_TONE } from '../../lib/catalog';

export default function Product() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, name, locale, unit, level } = useI18n();
  const toast = useToast();
  const { data: p, isPending, error, refetch } = useQuery({ queryKey: ['product', id], queryFn: () => api<ProductDetail>(`/products/${id}`) });
  const cart = useCart();
  const setItem = useSetCartItem();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState<string | null>(null);
  // Galereya kengligi — konteynerniki (web'da ilova tor ustunda), boshida oyna kengligi
  const window = useWindowDimensions();
  const [width, setWidth] = useState(window.width);

  const v = p?.variants.find((x) => x.id === variantId) ?? p?.variants.find((x) => x.stockLevel !== 'OUT_OF_STOCK') ?? p?.variants[0];
  const inCart = cart.data?.lines.find((l) => l.variantId === v?.id);
  const quantity = qty ?? inCart?.qty ?? p?.minQty ?? '1';

  // Narxni ekranda hisoblaymiz (server bilan bir xil qoida — @mebel/shared)
  const price = useMemo(() => {
    if (!v) return null;
    const check = validateQty(quantity, { minQty: p!.minQty, qtyStep: p!.qtyStep });
    const unitPrice = resolveUnitPrice({ basePrice: v.basePrice, tiers: v.tiers, groupPrice: v.groupPrice }, quantity).unitPrice;
    return { ok: check.ok, unitPrice, total: check.ok ? lineTotal(quantity, unitPrice) : 0 };
  }, [v, quantity, p]);

  if (isPending) return <Loader />;
  if (error || !p || !v) return <ErrorView error={error} onRetry={() => void refetch()} />;
  const attrs = attrsText;
  const orderable = v.stockLevel !== 'OUT_OF_STOCK';

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: name(p) }} />
      <ScrollView contentContainerStyle={{ paddingBottom: space(6) }}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={{ backgroundColor: '#f5f5f4' }}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        >
          {p.images.length ? (
            p.images.map((img) => <Image key={img.id} source={{ uri: imageUri(img.url)! }} style={{ width, height: width * 0.75 }} contentFit="cover" />)
          ) : (
            <View style={{ width, height: 220, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="cube-outline" size={64} color={colors.faint} />
            </View>
          )}
        </ScrollView>

        <View style={{ padding: space(4), gap: space(4) }}>
          <View style={{ gap: 4 }}>
            <Text v="title">{name(p)}</Text>
            <Text muted>{[p.brand?.name, name(p.category)].filter(Boolean).join(' · ')}</Text>
            {p.board && (
              <Text v="small" muted>
                {p.board.lengthMm} × {p.board.widthMm} mm{p.board.thicknessMm ? ` · ${p.board.thicknessMm} mm` : ''}
              </Text>
            )}
          </View>

          {p.variants.length > 1 && (
            <View style={{ gap: space(2) }}>
              {p.variants.map((x) => {
                const on = x.id === v.id;
                return (
                  <Pressable
                    key={x.id}
                    onPress={() => {
                      setVariantId(x.id);
                      setQty(null);
                    }}
                    style={{
                      padding: space(3),
                      borderRadius: radius.md,
                      borderWidth: on ? 2 : 1,
                      borderColor: on ? colors.brand : colors.border,
                      backgroundColor: colors.card,
                      opacity: x.stockLevel === 'OUT_OF_STOCK' ? 0.5 : 1,
                    }}
                  >
                    <Row style={{ justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text bold>{attrs(x.attributes) || x.sku}</Text>
                        <Text v="caption">{x.sku}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text bold>{som(x.price, locale)}</Text>
                        <Badge label={level(x.stockLevel)} tone={LEVEL_TONE[x.stockLevel]} />
                      </View>
                    </Row>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Card style={{ gap: space(3) }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <Text v="caption">{v.groupPrice !== null ? t('yourPrice') : ''}</Text>
                <Text v="title" color={colors.brandDark}>
                  {som(price?.unitPrice ?? v.price, locale)}
                  <Text muted> / {unit(p.unit)}</Text>
                </Text>
                {(price?.unitPrice ?? v.price) < v.basePrice && (
                  <Text v="small" muted style={{ textDecorationLine: 'line-through' }}>{som(v.basePrice, locale)}</Text>
                )}
              </View>
              <Badge label={level(v.stockLevel)} tone={LEVEL_TONE[v.stockLevel]} />
            </Row>
            {v.leadTimeDays ? <Text v="small" color={colors.info}>{t('leadTime', { days: v.leadTimeDays })}</Text> : null}
            {v.tiers.length > 0 && (
              <View style={{ gap: 4, backgroundColor: colors.brandBg, padding: space(3), borderRadius: radius.sm }}>
                <Text v="small" bold>{t('priceTiers')}</Text>
                {v.tiers.map((tier) => (
                  <Text key={tier.minQty} v="small">
                    {tier.minQty}+ {unit(p.unit)} → {som(tier.price, locale)}
                  </Text>
                ))}
              </View>
            )}
          </Card>

          {(p.descriptionUz || p.descriptionRu) && <Text muted>{locale === 'ru' ? p.descriptionRu : p.descriptionUz}</Text>}
        </View>
      </ScrollView>

      {orderable && (
        <View style={{ padding: space(4), gap: space(3), borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <QtyStepper value={quantity} onChange={setQty} step={Number(p.qtyStep)} min={Number(p.minQty)} unit={unit(p.unit)} />
            <Text v="h2">{price?.ok ? som(price.total, locale) : '—'}</Text>
          </Row>
          {!price?.ok && (
            <Text v="caption" color={colors.danger}>
              min {p.minQty}, {t('qty').toLowerCase()} × {p.qtyStep}
            </Text>
          )}
          <Button
            title={inCart ? `${t('inCart')}: ${inCart.qty} ${unit(p.unit)} — ${t('save').toLowerCase()}` : t('addToCart')}
            icon="cart"
            disabled={!price?.ok}
            loading={setItem.isPending}
            onPress={() =>
              setItem.mutate(
                { variantId: v.id, qty: quantity },
                {
                  onSuccess: () => {
                    toast(`${name(p)} — ${quantity} ${unit(p.unit)}`, 'success');
                    router.back();
                  },
                },
              )
            }
          />
        </View>
      )}
    </SafeAreaView>
  );
}
