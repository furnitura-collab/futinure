import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { DeliveryType } from '@mebel/shared';
import { TotalRow } from '@/components/cart/TotalRow';
import { CheckoutSection } from '@/components/checkout/CheckoutSection';
import { DateChoice, isValidChoice } from '@/components/checkout/DateChoice';
import { DestinationPicker } from '@/components/checkout/DestinationPicker';
import { OrderReview, WhatNext } from '@/components/checkout/OrderReview';
import { OptionCard } from '@/components/form/OptionCard';
import { Button, Card, Input, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { useSite } from '@/lib/layout';
import { useApiMutation } from '@/lib/mutation';
import type { Address, Warehouse } from '@/lib/types';
import { space } from '@/theme';

/** Bir martalik kalit — tarmoq uzilib qayta yuborilsa ham bitta buyurtma */
const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export default function Checkout() {
  const { t } = useI18n();
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
  const count = cart.data?.count ?? 0;
  const total = cart.data?.itemsTotal ?? 0;

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
      <TotalRow label={t('itemsCount', { n: count })} amount={total} />
      <Button
        title={t('placeOrder')}
        block
        disabled={loading || !ready || !isValidChoice(date)}
        loading={place.isPending}
        onPress={() => place.mutate(undefined)}
      />
    </>
  );
  const review = <OrderReview count={count} total={total} pickup={pickup} />;

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
            <WhatNext />
          </>
        ) : undefined
      }
      title={t('checkoutTitle')}
      crumbs={[{ label: t('tabCart'), href: '/cart' }]}
      contentStyle={{ gap: space(6) }}
    >
      <CheckoutSection n={1} title={t('stepMethod')}>
        <View style={{ gap: space(2) }}>
          <OptionCard selected={pickup} onPress={() => setType('PICKUP')} title={t('pickup')} subtitle={t('pickupHint')} />
          <OptionCard selected={!pickup} onPress={() => setType('DELIVERY')} title={t('delivery')} subtitle={t('deliveryHint')} />
        </View>
      </CheckoutSection>

      <CheckoutSection n={2} title={pickup ? t('stepWarehouse') : t('stepAddress')}>
        <DestinationPicker
          pickup={pickup}
          loading={loading}
          warehouses={warehouses.data}
          addresses={addresses.data}
          warehouseId={selectedWarehouse}
          addressId={selectedAddress}
          onWarehouse={setWarehouseId}
          onAddress={setAddressId}
        />
      </CheckoutSection>

      <CheckoutSection n={3} title={t('stepDate')} hint={t('stepDateHint')}>
        <DateChoice value={date} onChange={setDate} />
      </CheckoutSection>

      <CheckoutSection n={4} title={t('stepComment')}>
        <Input value={comment} onChangeText={setComment} placeholder={t('commentPlaceholder')} multiline />
      </CheckoutSection>

      {!site && review}
      {!site && <WhatNext />}
    </Screen>
  );
}
