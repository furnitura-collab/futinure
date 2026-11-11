import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { FlatList, RefreshControl, View, type TextInput } from 'react-native';
import { CatalogFilters, SORTS, type Filters } from '@/components/catalog/CatalogFilters';
import { CatalogSidebar } from '@/components/catalog/CatalogSidebar';
import { ProductCard } from '@/components/catalog/ProductCard';
import { QuickAddSheet } from '@/components/catalog/QuickAddSheet';
import { Appear, Chip, EmptyState, ErrorState, Button, Row, Screen, Skeleton, Text } from '@/components/ui';
import { Grid } from '@/components/web/Grid';
import { SelectField } from '@/components/web/SelectField';
import { TwoColumn } from '@/components/web/TwoColumn';
import { useI18n } from '@/i18n';
import { useCategories } from '@/lib/categories';
import { contained, CONTENT, gridColumns, useLayout, useSite } from '@/lib/layout';
import { usePaginated } from '@/lib/query';
import type { ProductCard as Product } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

function useDebounced<T>(v: T, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return d;
}

const INITIAL: Filters = { q: '', categoryId: null, inStock: false, sort: 'popular' };

export default function Catalog() {
  const { t, name } = useI18n();
  const { colors } = useTheme();
  const { site } = useSite();
  // Bosh sahifadan: ?categoryId=… (kategoriya) yoki ?focus=1 (qidiruv); sayt sarlavhasidan — ?q=…
  const params = useLocalSearchParams<{ categoryId?: string; focus?: string; q?: string }>();
  const [f, setF] = useState<Filters>({ ...INITIAL, categoryId: params.categoryId ?? null, q: params.q ?? '' });
  const [quick, setQuick] = useState<Product | null>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const query = useDebounced(f.q.trim());
  const categories = useCategories();
  const update = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));

  useEffect(() => {
    if (params.categoryId !== undefined) update({ categoryId: params.categoryId || null });
  }, [params.categoryId]);
  useEffect(() => {
    if (params.q !== undefined) update({ q: params.q });
  }, [params.q]);
  useEffect(() => {
    if (params.focus) setTimeout(() => inputRef.current?.focus(), 300);
  }, [params.focus]);

  const products = usePaginated<Product>(['products', query, f.categoryId, f.inStock, f.sort], '/products', {
    query: { q: query || undefined, categoryId: f.categoryId, inStock: f.inStock || undefined, sort: f.sort },
    keepPrevious: true,
  });
  const total = products.data?.pages[0]?.total;

  // Ustunlar soni ekran kengligidan: telefonda 2, kompyuterda 6 tagacha
  const { width: windowWidth } = useLayout();
  const [screenWidth, setScreenWidth] = useState(0);
  const [mainWidth, setMainWidth] = useState(CONTENT.wide - 260);
  const inner = Math.min(screenWidth || windowWidth, CONTENT.wide) - space(4) * 2;
  const columns = gridColumns(inner);
  const cardWidth = (inner - space(3) * (columns - 1)) / columns;

  const category = categories.data?.find((c) => c.id === f.categoryId);
  const active = [
    category && { key: 'c', label: name(category), clear: () => update({ categoryId: null }) },
    f.inStock && { key: 's', label: t('inStockOnly'), clear: () => update({ inStock: false }) },
    query && {
      key: 'q',
      label: `“${query}”`,
      clear: () => {
        update({ q: '' });
        // Sarlavhadagi qidiruv ham URL'dan o'qiydi
        if (params.q) router.setParams({ q: '' });
      },
    },
  ].filter((x): x is { key: string; label: string; clear: () => void } => !!x);

  const summary = (
    <Row between style={{ flexWrap: 'wrap', rowGap: space(2), marginBottom: space(1) }}>
      <Text v="small" muted>{total !== undefined ? t('resultsCount', { n: total }) : ' '}</Text>
      {active.length > 0 && (
        <Row gap={space(2)} style={{ flexWrap: 'wrap' }}>
          {active.map((a) => (
            <Chip key={a.key} label={a.label} active onPress={a.clear} />
          ))}
        </Row>
      )}
    </Row>
  );

  const empty = products.isPending ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
      {Array.from({ length: columns * 2 }, (_, i) => (
        <View key={i} style={{ width: cardWidth, gap: space(2) }}>
          <Skeleton height={cardWidth * 0.75} radius={radius.lg} />
          <Skeleton width="80%" height={14} />
          <Skeleton width="50%" height={14} />
        </View>
      ))}
    </View>
  ) : products.error ? (
    <ErrorState error={products.error} onRetry={() => void products.refetch()} />
  ) : (
    <EmptyState
      icon="search-outline"
      title={t('noProducts')}
      hint={t('noProductsHint')}
      action={active.length ? <Button title={t('clearFilters')} variant="outline" size="md" onPress={() => setF(INITIAL)} /> : null}
    />
  );

  if (site) {
    // Saytda: chapda filtr paneli, o'ngda — natija soni, faol filtrlar, saralash va mahsulot to'ri
    const siteColumns = Math.min(5, Math.max(2, gridColumns(mainWidth)));
    const siteCard = mainWidth / siteColumns - space(4);
    return (
      <Screen
        title={category ? name(category) : t('tabCatalog')}
        crumbs={category ? [{ label: t('tabCatalog'), href: { pathname: '/catalog', params: { categoryId: '' } } }] : undefined}
        onEndReached={products.loadMore}
      >
        <TwoColumn side="left" asideWidth={260} aside={<CatalogSidebar value={f} onChange={update} />}>
          <Row between style={{ flexWrap: 'wrap', rowGap: space(2), zIndex: 1 }}>
            <Row gap={space(2)} style={{ flexWrap: 'wrap', flexShrink: 1 }}>
              <Text v="small" muted>{total !== undefined ? t('resultsCount', { n: total }) : ' '}</Text>
              {active.map((a) => (
                <Chip key={a.key} label={a.label} active onPress={a.clear} />
              ))}
            </Row>
            <Row gap={space(2)}>
              <Text v="small" muted>{t('sortTitle')}</Text>
              <SelectField label={t('sortTitle')} value={f.sort} onChange={(sort) => update({ sort })} options={SORTS.map((s) => ({ value: s.value, label: t(s.key) }))} />
            </Row>
          </Row>
          <View onLayout={(e) => setMainWidth(e.nativeEvent.layout.width)}>
            {products.items.length ? (
              <Grid columns={siteColumns} gap={space(4)}>
                {products.items.map((p) => (
                  <ProductCard key={p.id} p={p} width={siteCard} onQuickAdd={setQuick} />
                ))}
              </Grid>
            ) : (
              empty
            )}
          </View>
        </TwoColumn>
        <QuickAddSheet product={quick} onClose={() => setQuick(null)} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} title={t('tabCatalog')}>
      {(insets) => (
        <View style={{ flex: 1 }} onLayout={(e) => setScreenWidth(e.nativeEvent.layout.width)}>
          {/* Qidiruv va filtrlar yopishgan: ro'yxat aylantirilsa ham qo'l ostida */}
          <View style={{ paddingTop: insets.top + space(3), paddingBottom: space(3), backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={[contained(CONTENT.wide), { paddingHorizontal: space(4) }]}>
              <CatalogFilters value={f} onChange={update} inputRef={inputRef} />
            </View>
          </View>
          <FlatList
            // numColumns o'zgarsa FlatList qayta yaratilishi kerak
            key={columns}
            data={products.items}
            keyExtractor={(p) => p.id}
            numColumns={columns}
            columnWrapperStyle={{ gap: space(3) }}
            contentContainerStyle={{
              ...contained(CONTENT.wide),
              paddingHorizontal: space(4),
              paddingTop: space(3),
              paddingBottom: insets.bottom + space(6),
              gap: space(3),
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReached={products.loadMore}
            onEndReachedThreshold={0.5}
            refreshControl={
              <RefreshControl
                refreshing={products.isRefetching && !products.isFetchingNextPage}
                onRefresh={() => void products.refetch()}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            ListHeaderComponent={summary}
            ListEmptyComponent={empty}
            renderItem={({ item, index }) => (
              <Appear index={index % 12}>
                <ProductCard p={item} width={cardWidth} onQuickAdd={setQuick} />
              </Appear>
            )}
          />
          <QuickAddSheet product={quick} onClose={() => setQuick(null)} />
        </View>
      )}
    </Screen>
  );
}
