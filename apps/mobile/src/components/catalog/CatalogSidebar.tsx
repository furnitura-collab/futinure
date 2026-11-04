import { View } from 'react-native';
import { Card, Divider, PressableScale, Text, Toggle } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useCategories } from '@/lib/categories';
import type { CategoryNode } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';
import type { Filters } from './CatalogFilters';

/** Ildiz tanlangan yoki uning ichidagisi tanlangan bo'lsa — bolalari ochiladi */
const contains = (c: CategoryNode, id: string | null): boolean => c.id === id || c.children.some((x) => contains(x, id));

/** Saytda katalog chap paneli: kategoriyalar (soni bilan) va "Faqat borlar" */
export function CatalogSidebar({ value, onChange }: { value: Filters; onChange: (f: Partial<Filters>) => void }) {
  const { t } = useI18n();
  const categories = useCategories();

  return (
    <Card style={{ gap: space(3), padding: space(3) }}>
      <Text v="caption" bold style={{ textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: space(2), paddingTop: space(1) }}>
        {t('categories')}
      </Text>
      <View accessibilityRole="list">
        <Item label={t('all')} active={!value.categoryId} onPress={() => onChange({ categoryId: null })} />
        {categories.data?.map((c) => (
          <View key={c.id}>
            <Item label={c} count={c.productCount} active={value.categoryId === c.id} onPress={() => onChange({ categoryId: c.id })} />
            {contains(c, value.categoryId) &&
              c.children.map((x) => <Item key={x.id} label={x} count={x.productCount} nested active={value.categoryId === x.id} onPress={() => onChange({ categoryId: x.id })} />)}
          </View>
        ))}
      </View>
      <Divider />
      <Text v="caption" bold style={{ textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: space(2) }}>
        {t('availability')}
      </Text>
      <View style={{ paddingHorizontal: space(2) }}>
        <Toggle value={value.inStock} onChange={(inStock) => onChange({ inStock })} label={t('inStockOnly')} />
      </View>
    </Card>
  );
}

function Item({ label, count, active, nested, onPress }: { label: string | CategoryNode; count?: number; active: boolean; nested?: boolean; onPress: () => void }) {
  const { name } = useI18n();
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      scale={0.99}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hoverStyle={active ? null : { backgroundColor: colors.muted }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space(2),
        minHeight: 36,
        paddingLeft: nested ? space(6) : space(2),
        paddingRight: space(2),
        borderRadius: radius.sm,
        backgroundColor: active ? colors.primarySoft : undefined,
      }}
    >
      <Text v="small" bold={active} color={active ? colors.accentForeground : undefined} style={{ flex: 1 }} numberOfLines={1}>
        {typeof label === 'string' ? label : name(label)}
      </Text>
      {count !== undefined && <Text v="caption">{count}</Text>}
    </PressableScale>
  );
}
