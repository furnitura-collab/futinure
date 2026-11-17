import { router } from 'expo-router';
import { View } from 'react-native';
import { OptionCard } from '@/components/form/OptionCard';
import { Button, Skeleton, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { Address, Warehouse } from '@/lib/types';
import { radius, space } from '@/theme';

interface DestinationPickerProps {
  pickup: boolean;
  loading: boolean;
  warehouses: Warehouse[] | undefined;
  addresses: Address[] | undefined;
  warehouseId: string | null;
  addressId: string | null;
  onWarehouse: (id: string) => void;
  onAddress: (id: string) => void;
}

/** Olib ketishda — ombor, yetkazishda — manzil (yo'q bo'lsa — yangi manzil qo'shish) */
export function DestinationPicker({ pickup, loading, warehouses, addresses, warehouseId, addressId, onWarehouse, onAddress }: DestinationPickerProps) {
  const { t } = useI18n();
  if (loading) return <Skeleton height={72} radius={radius.md} />;
  if (pickup) {
    return (
      <View style={{ gap: space(2) }}>
        {warehouses?.map((w) => (
          <OptionCard
            key={w.id}
            selected={w.id === warehouseId}
            onPress={() => onWarehouse(w.id)}
            title={w.name}
            subtitle={[w.addressText, w.workHours].filter(Boolean).join(' · ')}
          />
        ))}
      </View>
    );
  }
  return (
    <View style={{ gap: space(2) }}>
      {addresses?.map((a) => (
        <OptionCard key={a.id} selected={a.id === addressId} onPress={() => onAddress(a.id)} title={a.label ?? a.addressText} subtitle={a.label ? a.addressText : undefined} />
      ))}
      {!addresses?.length && <Text v="small" muted>{t('noAddressesHint')}</Text>}
      <Button title={t('addAddress')} variant={addresses?.length ? 'outline' : 'primary'} size="md" onPress={() => router.push('/address-new')} />
    </View>
  );
}
