import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { AddToCartBar } from '@/components/product/AddToCartBar';
import { PriceCard } from '@/components/product/PriceCard';
import { useProductPurchase } from '@/components/product/useProductPurchase';
import { VariantPicker } from '@/components/product/VariantPicker';
import { Button, Row, Sheet, Skeleton, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import type { ProductCard, ProductDetail } from '@/lib/types';
import { radius, space } from '@/theme';
import { ProductThumb } from './ProductThumb';

/** Ro'yxatdan "+" — variant va miqdorni tanlab, sahifadan chiqmasdan savatga qo'shish */
export function QuickAddSheet({ product, onClose }: { product: ProductCard | null; onClose: () => void }) {
  const { t, name } = useI18n();
  const id = product?.id;
  const { data: p } = useQuery({ queryKey: ['product', id], queryFn: () => api<ProductDetail>(`/products/${id}`), enabled: !!id });
  const buy = useProductPurchase(p);
  const v = buy.variant;

  return (
    <Sheet
      open={!!product}
      onClose={onClose}
      title={product ? name(product) : ''}
      footer={p && v ? <AddToCartBar p={p} buy={buy} onAdded={onClose} /> : undefined}
    >
      {product && (
        <Row gap={space(3)}>
          <View style={{ width: 64, height: 64, borderRadius: radius.md, overflow: 'hidden' }}>
            <ProductThumb imageUrl={product.imageUrl} categoryId={product.categoryId} kind={product.kind} iconSize={22} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text v="small" muted numberOfLines={1}>{product.brand?.name ?? ''}</Text>
            <Button
              title={t('productDetails')}
              variant="ghost"
              size="sm"
              style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
              onPress={() => {
                onClose();
                router.push({ pathname: '/product/[id]', params: { id: product.id } });
              }}
            />
          </View>
        </Row>
      )}
      {p && v && buy.price ? (
        <>
          <PriceCard v={v} unitPrice={buy.price.unitPrice} productUnit={p.unit} quantity={buy.quantity} />
          {p.variants.length > 1 && <VariantPicker variants={p.variants} selected={v} onSelect={buy.select} />}
        </>
      ) : (
        <View style={{ gap: space(3) }}>
          <Skeleton height={44} radius={radius.md} />
          <Skeleton height={120} radius={radius.lg} />
        </View>
      )}
    </Sheet>
  );
}
