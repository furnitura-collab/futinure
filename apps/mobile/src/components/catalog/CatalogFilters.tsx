import type { ProductSort } from '@mebel/shared';
import { router } from 'expo-router';
import { useState, type ComponentRef, type RefObject } from 'react';
import { ScrollView, View, type TextInput } from 'react-native';
import { Button, Chip, IconButton, Input, OptionList, Sheet } from '@/components/ui';
import { useI18n, type I18nKey } from '@/i18n';
import { useCategories } from '@/lib/categories';
import { space } from '@/theme';

export const SORTS: { value: ProductSort; key: I18nKey }[] = [
  { value: 'popular', key: 'sortPopular' },
  { value: 'price_asc', key: 'sortPriceAsc' },
  { value: 'price_desc', key: 'sortPriceDesc' },
  { value: 'name', key: 'sortName' },
];

export interface Filters {
  q: string;
  categoryId: string | null;
  inStock: boolean;
  sort: ProductSort;
}

/** Katalog tepasidagi yopishgan panel: qidiruv, "kod bo'yicha", saralash va filtr chiplari */
export function CatalogFilters({ value, onChange, inputRef }: { value: Filters; onChange: (f: Partial<Filters>) => void; inputRef: RefObject<ComponentRef<typeof TextInput> | null> }) {
  const { t, name } = useI18n();
  const categories = useCategories();
  const [sorting, setSorting] = useState(false);
  const sortLabel = t(SORTS.find((s) => s.value === value.sort)!.key);

  return (
    <View style={{ gap: space(3) }}>
      <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Input
            ref={inputRef}
            icon="search"
            value={value.q}
            onChangeText={(q) => onChange({ q })}
            placeholder={t('searchPlaceholder')}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t('searchPlaceholder')}
            right={value.q ? <IconButton icon="close-circle" label={t('clear')} size={36} onPress={() => onChange({ q: '' })} /> : null}
          />
        </View>
        <Button title={t('byCodeShort')} icon="barcode-outline" variant="outline" size="md" accessibilityLabel={t('quickSku')} onPress={() => router.push('/sku')} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2), paddingHorizontal: space(4) }} style={{ marginHorizontal: -space(4) }}>
        <Chip label={sortLabel} icon="swap-vertical" onPress={() => setSorting(true)} />
        <Chip label={t('inStockOnly')} icon={value.inStock ? 'checkmark-circle' : 'ellipse-outline'} active={value.inStock} onPress={() => onChange({ inStock: !value.inStock })} />
        <Chip label={t('all')} active={!value.categoryId} onPress={() => onChange({ categoryId: null })} />
        {categories.data?.map((c) => (
          <Chip key={c.id} label={name(c)} active={value.categoryId === c.id} onPress={() => onChange({ categoryId: value.categoryId === c.id ? null : c.id })} />
        ))}
      </ScrollView>
      <Sheet open={sorting} onClose={() => setSorting(false)} title={t('sortTitle')}>
        <OptionList
          value={value.sort}
          options={SORTS.map((s) => ({ value: s.value, label: t(s.key) }))}
          onChange={(sort) => {
            onChange({ sort });
            setSorting(false);
          }}
        />
      </Sheet>
    </View>
  );
}
