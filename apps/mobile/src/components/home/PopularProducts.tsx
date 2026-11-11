import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ProductCard } from '@/components/catalog/ProductCard';
import { QuickAddSheet } from '@/components/catalog/QuickAddSheet';
import { SectionHeader, Skeleton } from '@/components/ui';
import { Grid } from '@/components/web/Grid';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useLayout } from '@/lib/layout';
import type { ProductCard as Product } from '@/lib/types';
import { radius, space } from '@/theme';

/** Bosh sahifada ko'p sotilgan tovarlar — katalogga kirmasdan ham savatga qo'shish mumkin */
export function PopularProducts({ columns }: { columns: number }) {
  const { t } = useI18n();
  const { width } = useLayout();
  const [quick, setQuick] = useState<Product | null>(null);
  const q = useQuery({
    queryKey: ['products', 'popular', columns],
    queryFn: () => api<{ items: Product[] }>('/products', { query: { sort: 'popular', limit: columns * 2 } }),
  });
  if (q.isSuccess && !q.data.items.length) return null;
  const cardWidth = Math.min(width, 1200) / columns;

  return (
    <View style={{ gap: space(3) }}>
      <SectionHeader title={t('popularProducts')} action={t('allProducts')} onAction={() => router.navigate({ pathname: '/catalog', params: { categoryId: '' } })} />
      <Grid columns={columns}>
        {q.data
          ? q.data.items.map((p) => <ProductCard key={p.id} p={p} width={cardWidth} onQuickAdd={setQuick} />)
          : Array.from({ length: columns * 2 }, (_, i) => <Skeleton key={i} height={cardWidth} radius={radius.lg} />)}
      </Grid>
      <QuickAddSheet product={quick} onClose={() => setQuick(null)} />
    </View>
  );
}
