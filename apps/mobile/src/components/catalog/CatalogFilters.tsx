import type { ProductSort } from '@mebel/shared';
import { router } from 'expo-router';
import { useState, type ComponentRef, type RefObject } from 'react';
import { View, type TextInput } from 'react-native';
import { Chip, IconButton, Input, OptionList, Sheet } from '@/components/ui';
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

/** Katalog tepasidagi yopishgan panel: qidiruv, kod bo'yicha buyurtma, kategoriya, saralash va "faqat borlar" */
export function CatalogFilters({ value, onChange, inputRef }: { value: Filters; onChange: (f: Partial<Filters>) => void; inputRef: RefObject<ComponentRef<typeof TextInput> | null> }) {
  const { t, name } = useI18n();
  const categories = useCategories();
  const [picker, setPicker] = useState<'sort' | 'category' | null>(null);
  const sortLabel = t(SORTS.find((s) => s.value === value.sort)!.key);
  const category = categories.data?.find((c) => c.id === value.categoryId);

  return (
    <View style={{ gap: space(3) }}>
      <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Input
            ref={inputRef}
            icon="magnifying-glass"
            value={value.q}
            onChangeText={(q) => onChange({ q })}
            placeholder={t('searchPlaceholder')}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t('searchPlaceholder')}
            right={value.q ? <IconButton icon="x-circle" label={t('clear')} size={36} onPress={() => onChange({ q: '' })} /> : null}
          />
        </View>
        <IconButton icon="barcode" variant="secondary" size={48} label={t('quickSku')} onPress={() => router.push('/sku')} />
      </View>
      {/* Aylanadigan chiplar o'rniga: ikki tanlov (pastdan ro'yxat) va bitta almashtirgich — bir qatorga sig'adi */}
      <View style={{ flexDirection: 'row', gap: space(2) }}>
        <Chip grow label={category ? name(category) : t('category')} active={!!category} caret onPress={() => setPicker('category')} />
        <Chip grow label={sortLabel} caret onPress={() => setPicker('sort')} />
        <Chip grow label={t('inStockOnly')} active={value.inStock} onPress={() => onChange({ inStock: !value.inStock })} />
      </View>
      <Sheet open={picker === 'category'} onClose={() => setPicker(null)} title={t('categories')}>
        <OptionList
          value={value.categoryId ?? ''}
          options={[{ value: '', label: t('all') }, ...(categories.data ?? []).map((c) => ({ value: c.id, label: name(c) }))]}
          onChange={(id) => {
            onChange({ categoryId: id || null });
            setPicker(null);
          }}
        />
      </Sheet>
      <Sheet open={picker === 'sort'} onClose={() => setPicker(null)} title={t('sortTitle')}>
        <OptionList
          value={value.sort}
          options={SORTS.map((s) => ({ value: s.value, label: t(s.key) }))}
          onChange={(sort) => {
            onChange({ sort });
            setPicker(null);
          }}
        />
      </Sheet>
    </View>
  );
}
