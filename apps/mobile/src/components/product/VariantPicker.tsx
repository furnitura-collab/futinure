import { Image } from 'expo-image';
import { View } from 'react-native';
import { attributeLabel, attributeValue } from '@mebel/shared';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { imageUri } from '@/lib/catalog';
import type { ProductDetail } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

type Variant = ProductDetail['variants'][number];
type Value = string | number;

/** Variantlar orasida farq qiladigan atributlar — har biri alohida tanlov qatori */
export function variantAxes(variants: Variant[]): { key: string; values: Value[] }[] {
  const keys = [...new Set(variants.flatMap((v) => Object.keys(v.attributes)))];
  return keys
    .map((key) => ({ key, values: [...new Set(variants.map((v) => v.attributes[key]).filter((x): x is Value => x !== undefined))] }))
    .filter((a) => a.values.length > 1);
}

/** Bir atribut tanlanganda: shu qiymatli, qolgan tanlovlarga eng ko'p mos va sotuvdagi variant */
function pick(variants: Variant[], current: Variant, key: string, value: Value): Variant | undefined {
  const score = (v: Variant) =>
    Object.entries(current.attributes).filter(([k, x]) => k !== key && v.attributes[k] === x).length * 2 + (v.stockLevel === 'OUT_OF_STOCK' ? 0 : 1);
  return variants.filter((v) => v.attributes[key] === value).sort((a, b) => score(b) - score(a))[0];
}

/** Variant tanlash: har atribut o'z sarlavhasi bilan ("Rang", "Qalinlik") — "Qora · 16 · 0190" emas */
export function VariantPicker({ variants, selected, onSelect }: { variants: Variant[]; selected: Variant; onSelect: (id: string) => void }) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const axes = variantAxes(variants);
  if (!axes.length) return null;

  return (
    <View style={{ gap: space(4) }}>
      {axes.map(({ key, values }) => (
        <View key={key} style={{ gap: space(2) }} accessibilityRole="radiogroup" accessibilityLabel={attributeLabel(key, locale)}>
          <Text v="small" muted>
            {attributeLabel(key, locale)}: <Text v="small" bold>{attributeValue(key, selected.attributes[key] ?? '—')}</Text>
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
            {values.map((value) => {
              const on = selected.attributes[key] === value;
              const target = pick(variants, selected, key, value);
              const out = variants.filter((v) => v.attributes[key] === value).every((v) => v.stockLevel === 'OUT_OF_STOCK');
              const swatch = key === 'color' ? imageUri(target?.swatchUrl ?? null) : null;
              return (
                <PressableScale
                  key={String(value)}
                  onPress={() => target && onSelect(target.id)}
                  scale={0.96}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${attributeValue(key, value)}${out ? ` — ${t('soldOut')}` : ''}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space(2),
                    minHeight: 44,
                    paddingHorizontal: space(4),
                    borderRadius: radius.md,
                    borderWidth: on ? 2 : 1,
                    borderColor: on ? colors.primary : colors.border,
                    backgroundColor: on ? colors.primarySoft : colors.card,
                    opacity: out ? 0.5 : 1,
                  }}
                >
                  {swatch ? <Image source={{ uri: swatch }} style={{ width: 22, height: 22, borderRadius: 11 }} /> : null}
                  <Text bold={on} style={out ? { textDecorationLine: 'line-through' } : undefined}>{attributeValue(key, value)}</Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      ))}
      <Text v="caption">{t('skuLabel', { sku: selected.sku })}</Text>
    </View>
  );
}
