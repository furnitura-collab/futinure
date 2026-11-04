import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { AddToCartBar } from '@/components/product/AddToCartBar';
import { Gallery } from '@/components/product/Gallery';
import { PriceCard } from '@/components/product/PriceCard';
import { SpecsTable } from '@/components/product/SpecsTable';
import { useProductPurchase } from '@/components/product/useProductPurchase';
import { VariantPicker } from '@/components/product/VariantPicker';
import { Appear, Card, Divider, ErrorState, Row, Screen, Skeleton, Text } from '@/components/ui';
import { STICKY } from '@/components/web/TwoColumn';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useLayout, useSite } from '@/lib/layout';
import type { ProductDetail } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

export default function Product() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, name, locale } = useI18n();
  const { colors } = useTheme();
  const { wide } = useLayout();
  const { site } = useSite();
  const { data: p, isPending, error, refetch } = useQuery({ queryKey: ['product', id], queryFn: () => api<ProductDetail>(`/products/${id}`) });
  const buy = useProductPurchase(p);
  const v = buy.variant;

  if (isPending) {
    return (
      <Screen>
        <Skeleton height={220} radius={radius.xl} />
        <Skeleton width="70%" height={24} />
        <Skeleton width="40%" height={16} />
        <Skeleton height={140} radius={radius.lg} />
      </Screen>
    );
  }
  if (error || !p || !v || !buy.price) {
    return (
      <Screen>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const description = locale === 'ru' ? p.descriptionRu : p.descriptionUz;
  // Asosiy o'lchamlar sarlavha ostida "chip" bo'lib — ro'yxatni ochmasdan ko'rinadi
  const keySpecs = [p.board && `${p.board.lengthMm} × ${p.board.widthMm} mm`, p.board?.thicknessMm && `${Number(p.board.thicknessMm)} mm`].filter(Boolean) as string[];

  const details = (
    <>
      <Appear style={{ gap: space(2) }}>
        <Text v="title">{name(p)}</Text>
        <Text muted>{[p.brand?.name, name(p.category)].filter(Boolean).join(' · ')}</Text>
        {keySpecs.length > 0 && (
          <Row style={{ flexWrap: 'wrap' }}>
            {keySpecs.map((k) => (
              <View key={k} style={{ paddingHorizontal: space(3), paddingVertical: space(1), borderRadius: radius.full, backgroundColor: colors.muted }}>
                <Text v="small" bold>{k}</Text>
              </View>
            ))}
          </Row>
        )}
      </Appear>
      <Appear index={1}>
        <PriceCard v={v} unitPrice={buy.price.unitPrice} productUnit={p.unit} quantity={buy.quantity} />
      </Appear>
      {p.variants.length > 1 && (
        <Appear index={2}>
          <Card>
            <VariantPicker variants={p.variants} selected={v} onSelect={buy.select} />
          </Card>
        </Appear>
      )}
      <Appear index={3}>
        <SpecsTable p={p} v={v} />
      </Appear>
      {description ? <Text muted>{description}</Text> : null}
    </>
  );

  const title = <Stack.Screen options={{ title: name(p) }} />;
  const bar = <AddToCartBar p={p} buy={buy} />;

  // Sayt: chapda katta kvadrat rasm (yopishgan), o'ngda bitta xarid bloki; ostida — xususiyatlar va tavsif
  if (site) {
    return (
      <Screen
        title={name(p)}
        heading={false}
        crumbs={[
          { label: t('tabCatalog'), href: { pathname: '/catalog', params: { categoryId: '' } } },
          { label: name(p.category), href: { pathname: '/catalog', params: { categoryId: p.category.id } } },
        ]}
        contentStyle={{ gap: space(8) }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space(8) }}>
          <View style={[{ flex: 1, minWidth: 0 }, STICKY]}>
            <Gallery images={p.images} categoryId={p.category.id} kind={p.kind} square />
          </View>
          <Card style={{ flex: 1, minWidth: 0, gap: space(4), padding: space(6) }}>
            <View style={{ gap: space(2) }}>
              <Text v="display" accessibilityRole="header">{name(p)}</Text>
              <Text muted>{[p.brand?.name, name(p.category)].filter(Boolean).join(' · ')}</Text>
              {keySpecs.length > 0 && (
                <Row style={{ flexWrap: 'wrap' }}>
                  {keySpecs.map((k) => (
                    <View key={k} style={{ paddingHorizontal: space(3), paddingVertical: space(1), borderRadius: radius.full, backgroundColor: colors.muted }}>
                      <Text v="small" bold>{k}</Text>
                    </View>
                  ))}
                </Row>
              )}
            </View>
            <PriceCard v={v} unitPrice={buy.price.unitPrice} productUnit={p.unit} quantity={buy.quantity} flat />
            {p.variants.length > 1 && (
              <>
                <Divider />
                <VariantPicker variants={p.variants} selected={v} onSelect={buy.select} />
              </>
            )}
            <Divider />
            {bar}
          </Card>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space(8) }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <SpecsTable p={p} v={v} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>{description ? <Text muted>{description}</Text> : null}</View>
        </View>
      </Screen>
    );
  }

  // Keng ekran: chapda rasm, o'ngda ma'lumot va savatga qo'shish
  if (wide) {
    return (
      <Screen width="wide" title={name(p)} contentStyle={{ flexDirection: 'row', alignItems: 'flex-start', gap: space(8), paddingHorizontal: space(6), maxWidth: 1100 }}>
        {title}
        <View style={{ flex: 1 }}>
          <Gallery images={p.images} categoryId={p.category.id} kind={p.kind} />
        </View>
        <View style={{ flex: 1, gap: space(4) }}>
          {details}
          <Card style={{ gap: space(3) }}>{bar}</Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen footer={bar} title={name(p)}>
      {title}
      <Gallery images={p.images} categoryId={p.category.id} kind={p.kind} />
      {details}
    </Screen>
  );
}
