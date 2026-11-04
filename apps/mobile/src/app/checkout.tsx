import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { DeliveryType } from '@mebel/shared';
import { Button, Card, Ionicons, Input, Loader, Row, Segmented, Text } from '../components/ui';
import { api } from '../lib/api';
import { useCart } from '../lib/cart';
import { som } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useApiMutation } from '../lib/mutation';
import { colors, radius, space } from '../lib/theme';
import type { Address, Warehouse } from '../lib/types';
import { contained, CONTENT } from '../lib/layout';

/** Bir martalik kalit — tarmoq uzilib qayta yuborilsa ham bitta buyurtma */
const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export default function Checkout() {
  const { t, locale } = useI18n();
  const cart = useCart();
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: () => api<Address[]>('/addresses') });
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/warehouses'), staleTime: 10 * 60_000 });
  const [type, setType] = useState<DeliveryType>('PICKUP');
  const [addressId, setAddressId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [comment, setComment] = useState('');
  const idempotencyKey = useRef(newKey());

  const selectedAddress = addressId ?? addresses.data?.[0]?.id ?? null;
  const selectedWarehouse = warehouseId ?? warehouses.data?.[0]?.id ?? null;
  const validDate = !date || /^\d{4}-\d{2}-\d{2}$/.test(date);

  const place = useApiMutation(
    () =>
      api<{ id: string }>('/orders', {
        headers: { 'Idempotency-Key': idempotencyKey.current },
        body: {
          deliveryType: type,
          ...(type === 'DELIVERY' ? { addressId: selectedAddress } : { warehouseId: selectedWarehouse }),
          deliveryDate: date || undefined,
          comment: comment.trim() || undefined,
        },
      }),
    {
      invalidate: [['cart'], ['orders']],
      success: t('orderPlaced'),
      onSuccess: (o) => router.replace({ pathname: '/order/[id]', params: { id: o.id } }),
    },
  );

  if (cart.isPending || addresses.isPending || warehouses.isPending) return <Loader />;
  const ready = type === 'DELIVERY' ? !!selectedAddress : !!selectedWarehouse;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ ...contained(CONTENT.page), padding: space(4), gap: space(5) }} keyboardShouldPersistTaps="handled">
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: 'PICKUP', label: t('pickup') },
            { value: 'DELIVERY', label: t('delivery') },
          ]}
        />

        {type === 'DELIVERY' ? (
          <View style={{ gap: space(2) }}>
            <Text v="small" bold>{t('address')}</Text>
            {addresses.data?.map((a) => (
              <Option key={a.id} selected={a.id === selectedAddress} onPress={() => setAddressId(a.id)} title={a.label ?? a.addressText} subtitle={a.label ? a.addressText : undefined} />
            ))}
            <Button title={t('addAddress')} icon="add" variant="secondary" onPress={() => router.push('/address-new')} />
          </View>
        ) : (
          <View style={{ gap: space(2) }}>
            <Text v="small" bold>{t('warehouse')}</Text>
            {warehouses.data?.map((w) => (
              <Option
                key={w.id}
                selected={w.id === selectedWarehouse}
                onPress={() => setWarehouseId(w.id)}
                title={w.name}
                subtitle={[w.addressText, w.workHours].filter(Boolean).join(' · ')}
              />
            ))}
          </View>
        )}

        <Input label={t('desiredDate')} value={date} onChangeText={setDate} placeholder="2026-11-10" error={validDate ? null : 'YYYY-MM-DD'} keyboardType="numbers-and-punctuation" />
        <Input label={t('comment')} value={comment} onChangeText={setComment} multiline />

        <Card style={{ backgroundColor: colors.brandBg, borderColor: colors.brandSoft }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <Ionicons name="information-circle-outline" size={20} color={colors.brandDark} />
            <Text v="small" style={{ flex: 1 }}>{t('paymentNote')}</Text>
          </Row>
        </Card>
      </ScrollView>
      <View style={{ padding: space(4), borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
        <View style={{ ...contained(CONTENT.page), gap: space(3) }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text muted>{t('items')}: {cart.data?.count}</Text>
            <Text v="h2">{som(cart.data?.itemsTotal ?? 0, locale)}</Text>
          </Row>
          <Button title={t('placeOrder')} disabled={!ready || !validDate} loading={place.isPending} onPress={() => place.mutate(undefined)} />
        </View>
      </View>
    </View>
  );
}

function Option({ selected, onPress, title, subtitle }: { selected: boolean; onPress: () => void; title: string; subtitle?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space(3),
        padding: space(3),
        borderRadius: radius.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.brand : colors.border,
        backgroundColor: colors.card,
      }}
    >
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.brand : colors.faint} />
      <View style={{ flex: 1 }}>
        <Text bold>{title}</Text>
        {subtitle ? <Text v="caption">{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}
