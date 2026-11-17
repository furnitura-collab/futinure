import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { isBlockingIssue } from '@mebel/shared';
import { ProductThumb } from '@/components/catalog/ProductThumb';
import { Card, IconButton, PressableScale, QtyStepper, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useSetCartItem } from '@/lib/cart';
import { attrsLabeled } from '@/lib/catalog';
import type { CartLine } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';
import { CartIssue } from './CartIssue';

/** Savat qatori: rasm va nom (mahsulotga havola), miqdor, qator summasi va muammolar */
export function CartRow({ line: l }: { line: CartLine }) {
  const { t, money, unit, name, locale } = useI18n();
  const { colors } = useTheme();
  const setItem = useSetCartItem();
  const step = Number(l.qtyStep ?? 1);
  const min = Number(l.minQty ?? step);
  const u = l.unit ? unit(l.unit) : '';
  // Yozilayotgan qiymat; server javobi kelganda yangilanadi
  const [draft, setDraft] = useState(l.qty);
  useEffect(() => setDraft(l.qty), [l.qty]);
  const blocking = l.issues.some((i) => isBlockingIssue(i.code));
  const set = (qty: string) => setItem.mutate({ variantId: l.variantId, qty });

  return (
    <Card style={[{ gap: space(3) }, blocking && { borderColor: colors.destructive, borderWidth: 1 }]}>
      <Row style={{ alignItems: 'flex-start' }} gap={space(3)}>
        <PressableScale
          onPress={() => l.productId && router.push({ pathname: '/product/[id]', params: { id: l.productId } })}
          disabled={!l.productId}
          scale={0.99}
          accessibilityRole="link"
          accessibilityLabel={name(l)}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: space(3) }}
        >
          <View style={{ width: 64, height: 64, borderRadius: radius.md, overflow: 'hidden' }}>
            <ProductThumb imageUrl={l.imageUrl} categoryId={l.categoryId} kind={l.kind} iconSize={22} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text bold numberOfLines={2}>{name(l)}</Text>
            {l.attributes && Object.keys(l.attributes).length > 0 ? <Text v="caption" numberOfLines={2}>{attrsLabeled(l.attributes, locale)}</Text> : null}
            <Text v="caption">{u ? `${money(l.unitPrice)} / ${u}` : money(l.unitPrice)}</Text>
          </View>
        </PressableScale>
        <IconButton icon="trash" label={t('removeItem', { name: name(l) })} tone="destructive" size={40} onPress={() => set('0')} />
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
        <Text v="heading">{money(l.lineTotal)}</Text>
      </Row>
      {l.issues.map((i) => (
        <CartIssue key={i.code} line={l} issue={i} unit={u} pending={setItem.isPending} onFix={set} />
      ))}
    </Card>
  );
}
