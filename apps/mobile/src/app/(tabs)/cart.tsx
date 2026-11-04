import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { isBlockingIssue } from '@mebel/shared';
import { Button, Empty, ErrorView, Ionicons, Loader, QtyStepper, Row, Text } from '../../components/ui';
import { useCart, useSetCartItem } from '../../lib/cart';
import { attrsText } from '../../lib/catalog';
import { som } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { colors, radius, space } from '../../lib/theme';
import type { CartLine, LineIssue } from '../../lib/types';
import { contained, CONTENT } from '../../lib/layout';

export default function CartScreen() {
  const { t, locale } = useI18n();
  const cart = useCart();

  if (cart.isPending) return <Loader />;
  if (cart.error) return <ErrorView error={cart.error} onRetry={() => void cart.refetch()} />;
  const c = cart.data;

  if (c.count === 0) {
    return (
      <Empty
        icon="cart-outline"
        title={t('cartEmpty')}
        hint={t('cartEmptyHint')}
        action={<Button title={t('tabCatalog')} variant="secondary" onPress={() => router.navigate('/')} />}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={c.lines}
        keyExtractor={(l) => l.variantId}
        contentContainerStyle={{ ...contained(CONTENT.page), padding: space(4), gap: space(3) }}
        renderItem={({ item }) => <CartRow line={item} />}
      />
      <View style={{ padding: space(4), borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
        <View style={{ ...contained(CONTENT.page), gap: space(3) }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text muted>{t('weight')}: {c.totalWeightKg} kg</Text>
            <Text v="h2">{t('total')}: {som(c.itemsTotal, locale)}</Text>
          </Row>
          {c.hasBlockingIssues && <Text v="small" color={colors.danger}>{t('fixIssues')}</Text>}
          <Button title={t('checkout')} disabled={c.hasBlockingIssues} onPress={() => router.push('/checkout')} />
        </View>
      </View>
    </View>
  );
}

function CartRow({ line: l }: { line: CartLine }) {
  const { t, locale, unit, errorText } = useI18n();
  const setItem = useSetCartItem();
  const step = Number(l.qtyStep ?? 1);
  const min = Number(l.minQty ?? step);
  // Yozilayotgan qiymat; server javobi kelganda yangilanadi
  const [draft, setDraft] = useState(l.qty);
  useEffect(() => setDraft(l.qty), [l.qty]);
  const blocking = l.issues.filter((i) => isBlockingIssue(i.code));

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        padding: space(3),
        gap: space(2),
        borderWidth: 1,
        borderColor: blocking.length ? colors.danger : colors.border,
      }}
    >
      <Row style={{ alignItems: 'flex-start' }}>
        <Pressable style={{ flex: 1 }} onPress={() => l.productId && router.push({ pathname: '/product/[id]', params: { id: l.productId } })}>
          <Text bold numberOfLines={2}>{locale === 'ru' ? l.nameRu : l.nameUz}</Text>
          <Text v="caption">{[l.sku, attrsText(l.attributes)].filter(Boolean).join(' · ')}</Text>
        </Pressable>
        <Pressable onPress={() => setItem.mutate({ variantId: l.variantId, qty: '0' })} hitSlop={10} accessibilityLabel="delete">
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        {l.unit ? (
          <QtyStepper
            value={draft}
            step={step}
            min={min}
            unit={unit(l.unit)}
            onChange={setDraft}
            onCommit={(qty) => {
              if (qty && qty !== l.qty && Number(qty) > 0) setItem.mutate({ variantId: l.variantId, qty }, { onError: () => setDraft(l.qty) });
            }}
          />
        ) : <View />}
        <View style={{ alignItems: 'flex-end' }}>
          <Text bold>{som(l.lineTotal, locale)}</Text>
          <Text v="caption">{som(l.unitPrice, locale)} / {l.unit ? unit(l.unit) : ''}</Text>
        </View>
      </Row>
      {l.issues.map((i: LineIssue) => (
        <Text key={i.code} v="small" color={isBlockingIssue(i.code) ? colors.danger : colors.warning}>
          {i.code === 'EXCEEDS_AVAILABLE' ? t('onlyAvailable', { n: i.available ?? 0 }) : errorText(i.code, i.code)}
        </Text>
      ))}
    </View>
  );
}
