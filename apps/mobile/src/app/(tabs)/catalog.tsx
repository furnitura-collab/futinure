import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { CatalogFilters, SORTS } from '@/components/catalog/CatalogFilters';
import { CatalogEmpty, CatalogSummary } from '@/components/catalog/CatalogResults';
import { CatalogSidebar } from '@/components/catalog/CatalogSidebar';
import { ProductCard } from '@/components/catalog/ProductCard';
import { QuickAddSheet } from '@/components/catalog/QuickAddSheet';
import { useCatalogFilters } from '@/components/catalog/useCatalogFilters';
import { Appear, Screen } from '@/components/ui';
import { Grid } from '@/components/web/Grid';
import { SelectField } from '@/components/web/SelectField';
import { TwoColumn } from '@/components/web/TwoColumn';
import { useI18n } from '@/i18n';
import { contained, CONTENT, gridColumns, useLayout, useSite } from '@/lib/layout';
import type { ProductCard as Product } from '@/lib/types';
import { space, useTheme } from '@/theme';

export default function Catalog() {
  const { t, name } = useI18n();
  const { colors } = useTheme();
  const { site } = useSite();
  const c = useCatalogFilters();
  const { filters: f, update, products } = c;
  const [quick, setQuick] = useState<Product | null>(null);

  // Ustunlar soni ekran kengligidan: telefonda 2, kompyuterda 6 tagacha
  const { width: windowWidth } = useLayout();
  const [screenWidth, setScreenWidth] = useState(0);
  const [mainWidth, setMainWidth] = useState(CONTENT.wide - 260);
  const inner = Math.min(screenWidth || windowWidth, CONTENT.wide) - space(4) * 2;
  const columns = site ? Math.min(5, Math.max(2, gridColumns(mainWidth))) : gridColumns(inner);
  const cardWidth = site ? mainWidth / columns - space(4) : (inner - space(3) * (columns - 1)) / columns;

  const empty = (
    <CatalogEmpty
      pending={products.isPending}
      error={products.error}
      onRetry={() => void products.refetch()}
      filtered={c.active.length > 0}
      onReset={c.reset}
      columns={columns}
      cardWidth={cardWidth}
    />
  );
  const sheet = <QuickAddSheet product={quick} onClose={() => setQuick(null)} />;

  if (site) {
    return (
      <Screen
        title={c.category ? name(c.category) : t('tabCatalog')}
        crumbs={c.category ? [{ label: t('tabCatalog'), href: { pathname: '/catalog', params: { categoryId: '' } } }] : undefined}
        onEndReached={products.loadMore}
      >
        <TwoColumn side="left" asideWidth={260} aside={<CatalogSidebar value={f} onChange={update} />}>
          <CatalogSummary
            total={c.total}
            active={c.active}
            right={<SelectField label={t('sortTitle')} value={f.sort} onChange={(sort) => update({ sort })} options={SORTS.map((s) => ({ value: s.value, label: t(s.key) }))} />}
          />
          <View onLayout={(e) => setMainWidth(e.nativeEvent.layout.width)}>
            {products.items.length ? (
              <Grid columns={columns} gap={space(4)}>
                {products.items.map((p) => (
                  <ProductCard key={p.id} p={p} width={cardWidth} onQuickAdd={setQuick} />
                ))}
              </Grid>
            ) : (
              empty
            )}
          </View>
        </TwoColumn>
        {sheet}
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
              <CatalogFilters value={f} onChange={update} inputRef={c.inputRef} />
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
            ListHeaderComponent={<CatalogSummary total={c.total} active={c.active} />}
            ListEmptyComponent={empty}
            renderItem={({ item, index }) => (
              <Appear index={index % 12}>
                <ProductCard p={item} width={cardWidth} onQuickAdd={setQuick} />
              </Appear>
            )}
          />
          {sheet}
        </View>
      )}
    </Screen>
  );
}
