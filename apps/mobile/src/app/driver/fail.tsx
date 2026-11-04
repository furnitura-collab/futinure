import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { DRIVER_FAIL_REASONS, type DriverFailReason } from '@mebel/shared';
import { FieldLabel } from '@/components/form/FieldLabel';
import { Button, Chip, Input, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useDriverDelivery } from '@/lib/driver';
import { useApiMutation } from '@/lib/mutation';
import { space } from '@/theme';

/** Yetkazib bo'lmadi: tez sabab yoki o'z matni — tovar omborga qaytadi */
export default function DriverFail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const q = useDriverDelivery(id);
  const [reason, setReason] = useState<DriverFailReason | 'OTHER' | null>(null);
  const [other, setOther] = useState('');
  const text = reason === 'OTHER' ? other.trim() : reason ? t(`fr${reason}`) : '';

  const send = useApiMutation(() => api(`/driver/deliveries/${id}/fail`, { body: { reason: text, expectedVersion: q.data?.order.version } }), {
    invalidate: [['driver']],
    success: t('drvFailed'),
    onSuccess: () => router.dismissTo('/driver'),
  });

  return (
    <Screen
      width="form"
      footer={<Button title={t('drvFail')} variant="destructive" disabled={text.length < 3} loading={send.isPending} onPress={() => send.mutate(undefined)} />}
    >
      <FieldLabel>{t('drvReason')}</FieldLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
        {DRIVER_FAIL_REASONS.map((r) => (
          <Chip key={r} label={t(`fr${r}`)} active={reason === r} onPress={() => setReason(r)} />
        ))}
        <Chip label={t('drvOtherReason')} active={reason === 'OTHER'} onPress={() => setReason('OTHER')} />
      </View>
      {reason === 'OTHER' && <Input value={other} onChangeText={setOther} multiline autoFocus placeholder={t('drvReason')} />}
    </Screen>
  );
}
