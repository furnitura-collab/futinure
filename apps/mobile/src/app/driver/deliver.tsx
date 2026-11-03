import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { Button, Input, Loader, Row, Text } from '../../components/ui';
import { api, fileToForm } from '../../lib/api';
import { useDriverDelivery } from '../../lib/driver';
import { som } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { useApiMutation } from '../../lib/mutation';
import { colors, radius, space } from '../../lib/theme';

interface Picked {
  uri: string;
  name: string;
  mimeType: string;
  file?: Blob;
}

/** Topshirish: kim qabul qildi, surat, olingan naqd pul */
export default function DriverDeliver() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const q = useDriverDelivery(id);
  const [receiver, setReceiver] = useState('');
  const [cash, setCash] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [comment, setComment] = useState('');

  const toCollect = q.data?.order.toCollect ?? 0;
  const cashValue = cash ?? (toCollect ? String(toCollect) : '');
  const cashNum = Number(cashValue.replace(/\D/g, '')) || 0;

  const send = useApiMutation(
    async () => {
      const proofUploadId = photo ? (await api<{ id: string }>('/driver/uploads/proof', { form: await fileToForm(photo) })).id : undefined;
      return api(`/driver/deliveries/${id}/deliver`, {
        body: {
          receiverName: receiver.trim(),
          proofUploadId,
          cashCollected: cashNum || undefined,
          comment: comment.trim() || undefined,
          expectedVersion: q.data?.order.version,
        },
      });
    },
    { invalidate: [['driver']], success: t('drvDelivered'), onSuccess: () => router.dismissTo('/driver') },
  );

  const pick = async (camera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
    }
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const a = r.assets?.[0];
    if (!r.canceled && a) setPhoto({ uri: a.uri, name: a.fileName ?? 'foto.jpg', mimeType: a.mimeType ?? 'image/jpeg', file: a.file });
  };

  if (q.isPending) return <Loader />;

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }} keyboardShouldPersistTaps="handled">
      <Text bold>{q.data?.order.number}</Text>
      <Input label={t('drvReceiver')} value={receiver} onChangeText={setReceiver} autoCapitalize="words" autoFocus />

      {toCollect > 0 && (
        <View style={{ gap: 4 }}>
          <Input label={t('drvCash')} value={cashValue} onChangeText={setCash} keyboardType="number-pad" />
          <Text v="caption">
            {t('drvToCollect')}: {som(toCollect, locale)}
          </Text>
        </View>
      )}

      <View style={{ gap: space(2) }}>
        <Text v="small" bold>{t('drvPhoto')}</Text>
        {photo ? (
          <View style={{ borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
            <Image source={{ uri: photo.uri }} style={{ height: 220 }} contentFit="cover" />
            <Button title="✕" variant="ghost" small onPress={() => setPhoto(null)} />
          </View>
        ) : (
          <Row>
            {Platform.OS !== 'web' && <Button title={t('takePhoto')} icon="camera-outline" variant="secondary" small style={{ flex: 1 }} onPress={() => void pick(true)} />}
            <Button title={t('pickPhoto')} icon="image-outline" variant="secondary" small style={{ flex: 1 }} onPress={() => void pick(false)} />
          </Row>
        )}
      </View>

      <Input label={t('comment')} value={comment} onChangeText={setComment} multiline />

      <Button
        title={t('drvDeliver')}
        icon="checkmark-circle-outline"
        disabled={receiver.trim().length < 2 || cashNum > toCollect}
        loading={send.isPending}
        onPress={() => send.mutate(undefined)}
      />
    </ScrollView>
  );
}
