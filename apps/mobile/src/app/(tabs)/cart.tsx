import { router } from 'expo-router';
import { FlatList } from 'react-native';
import { CartRow } from '@/components/cart/CartRow';
import { CartSummary } from '@/components/cart/CartSummary';
import { Appear, Button, EmptyState, ErrorState, Row, Screen, SkeletonList, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useCart } from '@/lib/cart';
import { useSite } from '@/lib/layout';
import { space } from '@/theme';

export default function CartScreen() {
  const { t, money } = useI18n();
  const cart = useCart();
  const { site } = useSite();
  const c = cart.data;

  if (!c || c.count === 0) {
    return (
      <Screen title={t('tabCart')}>
        {cart.isPending ? (
          <SkeletonList count={3} />
        ) : cart.error ? (
          <ErrorState error={cart.error} onRetry={() => void cart.refetch()} />
        ) : (
          <EmptyState
            icon="cart-outline"
            title={t('cartEmpty')}
            hint={t('cartEmptyHint')}
            action={<Button title={t('goToCatalog')} variant="outline" size="md" onPress={() => router.navigate('/catalog')} />}
          />
        )}
      </Screen>
    );
  }

  const footer = (
    <>
      {c.hasBlockingIssues ? (
        <Text v="small" tone="destructive">{t('fixIssues')}</Text>
      ) : site ? null : (
        // Saytda jami summa yonidagi xulosa kartasida turibdi
        <Row between>
          <Text muted>{t('total')}</Text>
          <Text v="heading">{money(c.itemsTotal)}</Text>
        </Row>
      )}
      <Button title={t('checkout')} block disabled={c.hasBlockingIssues} onPress={() => router.push('/checkout')} />
    </>
  );

  // Saytda: chapda qatorlar, o'ngda yopishgan xulosa va "Rasmiylashtirish"
  if (site) {
    return (
      <Screen title={t('tabCart')} aside={<CartSummary c={c} />} footer={footer} contentStyle={{ gap: space(3) }}>
        {c.lines.map((l, index) => (
          <Appear key={l.variantId} index={index}>
            <CartRow line={l} />
          </Appear>
        ))}
      </Screen>
    );
  }

  return (
    <Screen scroll={false} title={t('tabCart')} footer={footer}>
      {(insets) => (
        <FlatList
          data={c.lines}
          keyExtractor={(l) => l.variantId}
          contentContainerStyle={{ ...insets.container, paddingTop: insets.top + space(4), paddingBottom: insets.bottom + space(4), gap: space(3) }}
          renderItem={({ item, index }) => (
            <Appear index={index}>
              <CartRow line={item} />
            </Appear>
          )}
          ListFooterComponent={<CartSummary c={c} />}
        />
      )}
    </Screen>
  );
}
