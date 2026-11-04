import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { Badge, Chip, Empty, ErrorView, Ionicons, Loader, Row, Text } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { som } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { colors, radius, space } from '../../lib/theme';
import type { CategoryNode, Paginated, ProductCard } from '../../lib/types';
import { imageUri, LEVEL_TONE } from '../../lib/catalog';
import { contained, CONTENT, gridColumns, useLayout } from '../../lib/layout';

function useDebounced<T>(v: T, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return d;
}

export default function Catalog() {
  const { t, name, locale, level } = useI18n();
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [inStock, setInStock] = useState(false);
  const query = useDebounced(q.trim());

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryNode[]>('/categories'), staleTime: 5 * 60_000 });
  const products = useInfiniteQuery({
    queryKey: ['products', query, categoryId, inStock],
    queryFn: ({ pageParam }) =>
      api<Paginated<ProductCard>>('/products', {
        query: { q: query || undefined, categoryId, inStock: inStock || undefined, page: pageParam, limit: 20 },
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
  const items = products.data?.pages.flatMap((p) => p.items) ?? [];

  // Ustunlar soni ekran kengligidan: telefonda 2, kompyuterda 6 tagacha
  const { width: windowWidth } = useLayout();
  const [screenWidth, setScreenWidth] = useState(0);
  const inner = Math.min(screenWidth || windowWidth, CONTENT.wide) - space(4) * 2;
  const columns = gridColumns(inner);
  const cardWidth = (inner - space(3) * (columns - 1)) / columns;

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setScreenWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/sku')} style={{ paddingHorizontal: space(4) }} accessibilityLabel={t('quickSku')}>
              <Ionicons name="barcode-outline" size={24} color={colors.brand} />
            </Pressable>
          ),
        }}
      />
      <View style={{ ...contained(CONTENT.wide), padding: space(4), paddingBottom: space(2), gap: space(3) }}>
        <Row style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space(3) }}>
          <Ionicons name="search" size={18} color={colors.faint} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t('search')}
            placeholderTextColor={colors.faint}
            style={{ flex: 1, height: 44, fontSize: 16, color: colors.text }}
            returnKeyType="search"
            autoCorrect={false}
          />
          {q ? (
            <Pressable onPress={() => setQ('')}>
              <Ionicons name="close-circle" size={18} color={colors.faint} />
            </Pressable>
          ) : null}
        </Row>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
          <Chip label={t('all')} active={!categoryId} onPress={() => setCategoryId(null)} />
          {categories.data?.map((c) => (
            <Chip key={c.id} label={name(c)} active={categoryId === c.id} onPress={() => setCategoryId(categoryId === c.id ? null : c.id)} />
          ))}
          <Chip label={t('inStockOnly')} active={inStock} onPress={() => setInStock(!inStock)} />
        </ScrollView>
      </View>

      {products.isPending ? (
        <Loader />
      ) : products.error ? (
        <ErrorView error={products.error instanceof ApiError ? new Error(products.error.message) : products.error} onRetry={() => void products.refetch()} />
      ) : (
        <FlatList
          // numColumns o'zgarsa FlatList qayta yaratilishi kerak
          key={columns}
          data={items}
          keyExtractor={(p) => p.id}
          numColumns={columns}
          columnWrapperStyle={{ gap: space(3) }}
          contentContainerStyle={{ ...contained(CONTENT.wide), padding: space(4), paddingTop: space(1), gap: space(3) }}
          onEndReached={() => products.hasNextPage && !products.isFetchingNextPage && void products.fetchNextPage()}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={products.isRefetching} onRefresh={() => void products.refetch()} />}
          ListEmptyComponent={<Empty icon="search-outline" title={t('noProducts')} />}
          renderItem={({ item: p }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } })}
              style={{ width: cardWidth, backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}
            >
              <View style={{ aspectRatio: 1, backgroundColor: '#f5f5f4' }}>
                {p.imageUrl ? (
                  <Image source={{ uri: imageUri(p.imageUrl)! }} style={{ flex: 1 }} contentFit="cover" transition={150} />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="cube-outline" size={40} color={colors.faint} />
                  </View>
                )}
              </View>
              <View style={{ padding: space(3), gap: 4 }}>
                <Text v="small" bold numberOfLines={2}>{name(p)}</Text>
                {p.brand ? <Text v="caption">{p.brand.name}</Text> : null}
                <Text bold color={colors.brandDark}>
                  {p.variantCount > 1 ? `${som(p.priceFrom, locale)} ${t('from')}` : som(p.priceFrom, locale)}
                </Text>
                {p.priceFrom < p.basePriceFrom && (
                  <Text v="caption" style={{ textDecorationLine: 'line-through' }}>{som(p.basePriceFrom, locale)}</Text>
                )}
                <Badge label={level(p.stockLevel)} tone={LEVEL_TONE[p.stockLevel]} />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

