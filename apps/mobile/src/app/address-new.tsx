import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Button, Input, Row, Text, Toggle, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useApiMutation } from '../lib/mutation';
import { colors, space } from '../lib/theme';
import { contained, CONTENT } from '../lib/layout';

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
    <ScrollView contentContainerStyle={{ ...contained(CONTENT.page), padding: space(4), gap: space(4) }} keyboardShouldPersistTaps="handled">
      <Button
        title={coords ? `✓ ${t('locationSet')}` : t('useMyLocation')}
        icon="navigate-outline"
        variant="secondary"
        loading={locating}
        onPress={() => void locate()}
      />
      {coords && (
        <Text v="caption" color={colors.success}>
          {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
        </Text>
      )}
      <Input label={t('addressText')} value={addressText} onChangeText={setAddressText} multiline />
      <Row>
        <Input label={t('label')} value={label} onChangeText={setLabel} style={{ width: 200 }} />
        <Input label={t('floor')} value={floor} onChangeText={(v) => setFloor(v.replace(/\D/g, ''))} keyboardType="number-pad" style={{ width: 90 }} />
      </Row>
      <Toggle value={needsLoaders} onChange={setNeedsLoaders} label={t('needsLoaders')} />
      <Button title={t('save')} disabled={addressText.trim().length < 5} loading={save.isPending} onPress={() => save.mutate(undefined)} />
    </ScrollView>
  );
}
