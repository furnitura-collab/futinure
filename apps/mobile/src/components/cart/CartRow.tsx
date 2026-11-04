import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { isBlockingIssue } from '@mebel/shared';
import { ProductThumb } from '@/components/catalog/ProductThumb';
import { Button, Card, IconButton, PressableScale, QtyStepper, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useSetCartItem } from '@/lib/cart';
import { attrsLabeled } from '@/lib/catalog';
import type { CartLine, LineIssue } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

const round = (x: number) => String(Math.round(x * 1000) / 1000);

/** Muammoni bir bosishda tuzatish: to'g'ri miqdorga keltirish yoki olib tashlash */
function fixFor(l: CartLine, i: LineIssue): string | null {
  const step = Number(l.qtyStep ?? 1);
  const min = Number(l.minQty ?? step);
  if (i.code === 'EXCEEDS_AVAILABLE') {
    const max = Math.floor(Number(i.available ?? 0) / step) * step;
    return max >= min ? round(max) : '0';
  }
  if (i.code === 'BELOW_MIN' || i.code === 'NOT_MULTIPLE_OF_STEP') return round(Math.max(min, Math.ceil(Number(l.qty) / step) * step));
  if (isBlockingIssue(i.code)) return '0';
  return null;
}

export function CartRow({ line: l }: { line: CartLine }) {
  const { t, money, unit, name, errorText, locale } = useI18n();
  const { colors } = useTheme();
  const setItem = useSetCartItem();
  const step = Number(l.qtyStep ?? 1);
  const min = Number(l.minQty ?? step);
  const u = l.unit ? unit(l.unit) : '';
  // Yozilayotgan qiymat; server javobi kelganda yangilanadi
  const [draft, setDraft] = useState(l.qty);
  useEffect(() => setDraft(l.qty), [l.qty]);
  const blocking = l.issues.some((i) => isBlockingIssue(i.code));
  const open = () => l.productId && router.push({ pathname: '/product/[id]', params: { id: l.productId } });

  return (
    <Card style={[{ gap: space(3) }, blocking && { borderColor: colors.destructive, borderWidth: 1 }]}>
      <Row style={{ alignItems: 'flex-start' }} gap={space(3)}>
        <PressableScale onPress={open} disabled={!l.productId} accessibilityRole="link" accessibilityLabel={name(l)} style={{ width: 64, height: 64, borderRadius: radius.md, overflow: 'hidden' }}>
          <ProductThumb imageUrl={l.imageUrl} categoryId={l.categoryId} kind={l.kind} iconSize={22} />
        </PressableScale>
        <PressableScale onPress={open} disabled={!l.productId} scale={0.99} style={{ flex: 1, gap: 2 }} accessibilityRole="link">
          <Text bold numberOfLines={2}>{name(l)}</Text>
          {l.attributes && Object.keys(l.attributes).length > 0 ? <Text v="caption" numberOfLines={2}>{attrsLabeled(l.attributes, locale)}</Text> : null}
          <Text v="caption">
            {money(l.unitPrice)}
            {u ? ` / ${u}` : ''}
          </Text>
        </PressableScale>
        <IconButton icon="trash-outline" label={t('removeItem', { name: name(l) })} tone="destructive" size={40} onPress={() => setItem.mutate({ variantId: l.variantId, qty: '0' })} />
      </Row>
      <Row between style={{ flexWrap: 'wrap', rowGap: space(2) }}>
        {l.unit ? (
          <QtyStepper
            value={draft}
            step={step}
            min={min}
            unit={u}
            onChange={setDraft}
            onCommit={(qty) => {
              if (qty && qty !== l.qty && Number(qty) > 0) setItem.mutate({ variantId: l.variantId, qty }, { onError: () => setDraft(l.qty) });
            }}
          />
        ) : (
          <View />
        )}
        <Text v="h2">{money(l.lineTotal)}</Text>
      </Row>
      {l.issues.map((i) => {
        const fix = fixFor(l, i);
        const bad = isBlockingIssue(i.code);
        return (
          <View key={i.code} style={{ gap: space(2), padding: space(3), borderRadius: radius.md, backgroundColor: bad ? colors.destructiveSoft : colors.warningSoft }}>
            <Text v="small" tone={bad ? 'destructive' : 'warning'}>
              {i.code === 'EXCEEDS_AVAILABLE' ? t('onlyAvailable', { n: `${i.available ?? 0} ${u}` }) : errorText(i.code, i.code)}
            </Text>
            {fix !== null && (
              <Button
                title={fix === '0' ? t('removeFromCart') : t('setQtyTo', { qty: `${fix} ${u}` })}
                size="sm"
                variant="outline"
                style={{ alignSelf: 'flex-start' }}
                loading={setItem.isPending}
                onPress={() => setItem.mutate({ variantId: l.variantId, qty: fix })}
              />
            )}
          </View>
        );
      })}
    </Card>
  );
}
