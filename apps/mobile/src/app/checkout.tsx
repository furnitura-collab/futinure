import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { DeliveryType } from '@mebel/shared';
import { CheckoutSection } from '@/components/checkout/CheckoutSection';
import { DateChoice, isValidChoice } from '@/components/checkout/DateChoice';
import { OptionCard } from '@/components/form/OptionCard';
import { SumRow } from '@/components/order/SumRow';
import { Button, Card, Icon, Input, Row, Screen, Skeleton, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { useSite } from '@/lib/layout';
import { useApiMutation } from '@/lib/mutation';
import type { Address, Warehouse } from '@/lib/types';
import { radius, space } from '@/theme';

/** Bir martalik kalit — tarmoq uzilib qayta yuborilsa ham bitta buyurtma */
const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export default function Checkout() {
  const { t, money } = useI18n();
  const cart = useCart();
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: () => api<Address[]>('/addresses') });
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/warehouses'), staleTime: 10 * 60_000 });
  const [type, setType] = useState<DeliveryType>('PICKUP');
  const [addressId, setAddressId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [comment, setComment] = useState('');
  const idempotencyKey = useRef(newKey());
  const { site } = useSite();

  const selectedAddress = addressId ?? addresses.data?.[0]?.id ?? null;
  const selectedWarehouse = warehouseId ?? warehouses.data?.[0]?.id ?? null;
  const loading = cart.isPending || addresses.isPending || warehouses.isPending;
  const pickup = type === 'PICKUP';

  const place = useApiMutation(
    () =>
      api<{ id: string }>('/orders', {
        headers: { 'Idempotency-Key': idempotencyKey.current },
        body: {
          deliveryType: type,
          ...(pickup ? { warehouseId: selectedWarehouse } : { addressId: selectedAddress }),
          deliveryDate: date || undefined,
          comment: comment.trim() || undefined,
        },
      }),
    {
      invalidate: [['cart'], ['orders'], ['buy-again']],
      success: t('orderPlaced'),
      onSuccess: (o) => router.replace({ pathname: '/order/[id]', params: { id: o.id } }),
    },
  );

  const ready = pickup ? !!selectedWarehouse : !!selectedAddress;

  const submit = (
    <>
      <Row between>
        <Text muted>{t('itemsCount', { n: cart.data?.count ?? 0 })}</Text>
        <Text v="heading">{money(cart.data?.itemsTotal ?? 0)}</Text>
      </Row>
      <Button
        title={t('placeOrder')}
        icon="paper-plane-outline"
        block
        disabled={loading || !ready || !isValidChoice(date)}
        loading={place.isPending}
        onPress={() => place.mutate(undefined)}
      />
    </>
  );

  const review = (
    <Card style={{ gap: space(2) }}>
      <Text v="h2">{t('reviewTitle')}</Text>
      <SumRow label={t('itemsCount', { n: cart.data?.count ?? 0 })} value={money(cart.data?.itemsTotal ?? 0)} />
      <SumRow label={t('deliveryFee')} value={pickup ? t('free') : t('byManager')} />
      <Button title={t('editCart')} variant="ghost" size="sm" icon="create-outline" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => router.back()} />
    </Card>
  );

  const whatNext = (
    <Card tone="info" style={{ gap: space(2) }}>
      <Row gap={space(2)}>
        <Icon name="information-circle" size={20} tone="info" />
        <Text bold tone="info">{t('whatNextTitle')}</Text>
      </Row>
      {(['whatNext1', 'whatNext2', 'whatNext3'] as const).map((k, i) => (
        <Row key={k} gap={space(2)} style={{ alignItems: 'flex-start' }}>
          <Text v="small" bold>{i + 1}.</Text>
          <Text v="small" style={{ flex: 1 }}>{t(k)}</Text>
        </Row>
      ))}
    </Card>
  );

  return (
    <Screen
      width="form"
      footer={site ? undefined : submit}
      // Saytda: o'ngda yopishgan xulosa, yuborish tugmasi va "keyin nima"
      aside={
        site ? (
          <>
            {review}
            <Card style={{ gap: space(3) }}>{submit}</Card>
            {whatNext}
          </>
        ) : undefined
      }
      title={t('checkoutTitle')}
      crumbs={[{ label: t('tabCart'), href: '/cart' }]}
      contentStyle={{ gap: space(6) }}
    >
      <CheckoutSection n={1} title={t('stepMethod')}>
        <View style={{ gap: space(2) }}>
          <OptionCard selected={pickup} onPress={() => setType('PICKUP')} icon="storefront-outline" title={t('pickup')} subtitle={t('pickupHint')} />
          <OptionCard selected={!pickup} onPress={() => setType('DELIVERY')} icon="car-outline" title={t('delivery')} subtitle={t('deliveryHint')} />
        </View>
      </CheckoutSection>

      <CheckoutSection n={2} title={pickup ? t('stepWarehouse') : t('stepAddress')}>
        {loading ? (
          <Skeleton height={72} radius={radius.md} />
        ) : pickup ? (
          <View style={{ gap: space(2) }}>
            {warehouses.data?.map((w) => (
              <OptionCard
                key={w.id}
                selected={w.id === selectedWarehouse}
                onPress={() => setWarehouseId(w.id)}
                title={w.name}
                subtitle={[w.addressText, w.workHours].filter(Boolean).join(' · ')}
              />
            ))}
          </View>
        ) : (
          <View style={{ gap: space(2) }}>
            {addresses.data?.map((a) => (
              <OptionCard key={a.id} selected={a.id === selectedAddress} onPress={() => setAddressId(a.id)} title={a.label ?? a.addressText} subtitle={a.label ? a.addressText : undefined} />
            ))}
            {!addresses.data?.length && <Text v="small" muted>{t('noAddressesHint')}</Text>}
            <Button title={t('addAddress')} icon="add" variant="outline" size="md" onPress={() => router.push('/address-new')} />
          </View>
        )}
      </CheckoutSection>

      <CheckoutSection n={3} title={t('stepDate')} hint={t('stepDateHint')}>
        <DateChoice value={date} onChange={setDate} />
      </CheckoutSection>

      <CheckoutSection n={4} title={t('stepComment')}>
        <Input value={comment} onChangeText={setComment} placeholder={t('commentPlaceholder')} multiline />
      </CheckoutSection>

      {!site && review}
      {!site && whatNext}
    </Screen>
  );
}
