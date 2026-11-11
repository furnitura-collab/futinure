import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Input, Row, Screen, Text, Toggle, useToast } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { space } from '@/theme';

/** Toshkent markazi — joylashuv aniqlanmasa (menejer manzil matnidan aniqlaydi) */
const TASHKENT = { lat: 41.311, lng: 69.279 };

export default function AddressNew() {
  const { t } = useI18n();
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [addressText, setAddressText] = useState('');
  const [floor, setFloor] = useState('');
  const [needsLoaders, setNeedsLoaders] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const locate = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return toast(t('locationDenied'), 'error');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      // Manzil matnini telefon o'zi topib bersa — to'ldiramiz (web'da ishlamaydi)
      const [place] = await Location.reverseGeocodeAsync(pos.coords).catch(() => []);
      if (place && !addressText) {
        setAddressText([place.city, place.district, place.street, place.streetNumber].filter(Boolean).join(', '));
      }
      toast(t('locationSet'), 'success');
    } catch {
      toast(t('locationDenied'), 'error');
    } finally {
      setLocating(false);
    }
  };

  const save = useApiMutation(
    () =>
      api('/addresses', {
        body: {
          label: label.trim() || null,
          addressText: addressText.trim(),
          ...(coords ?? TASHKENT),
          floor: floor ? Number(floor) : null,
          needsLoaders,
        },
      }),
    { invalidate: [['addresses']], onSuccess: () => router.back() },
  );

  return (
    <Screen
      width="form"
      modal
      title={t('addAddress')}
      footer={<Button title={t('save')} block disabled={addressText.trim().length < 5} loading={save.isPending} onPress={() => save.mutate(undefined)} />}
    >
      <View style={{ gap: space(2) }}>
        <Button
          title={coords ? t('locationSet') : t('useMyLocation')}
          variant={coords ? 'secondary' : 'outline'}
          block
          loading={locating}
          onPress={() => void locate()}
        />
        {coords && (
          <Text v="caption" tone="success" center>
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </Text>
        )}
      </View>
      <Card style={{ gap: space(4) }}>
        <Input label={t('addressText')} value={addressText} onChangeText={setAddressText} multiline />
        <Row style={{ alignItems: 'flex-start' }} gap={space(3)}>
          <View style={{ flex: 1 }}>
            <Input label={t('label')} value={label} onChangeText={setLabel} />
          </View>
          <View style={{ width: 96 }}>
            <Input label={t('floor')} value={floor} onChangeText={(v) => setFloor(v.replace(/\D/g, ''))} keyboardType="number-pad" />
          </View>
        </Row>
        <Toggle value={needsLoaders} onChange={setNeedsLoaders} label={t('needsLoaders')} />
      </Card>
    </Screen>
  );
}
