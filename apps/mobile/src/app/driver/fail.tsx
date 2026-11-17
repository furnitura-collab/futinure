import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { DRIVER_FAIL_REASONS, type DriverFailReason } from '@mebel/shared';
import { FieldLabel } from '@/components/form/FieldLabel';
import { OptionCard } from '@/components/form/OptionCard';
import { Button, Input, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useDriverDelivery } from '@/lib/driver';
import { useApiMutation } from '@/lib/mutation';
import { space } from '@/theme';

type Reason = DriverFailReason | 'OTHER';
const REASONS: Reason[] = [...DRIVER_FAIL_REASONS, 'OTHER'];

/** Yetkazib bo'lmadi: tayyor sabab yoki o'z matni — tovar omborga qaytadi */
export default function DriverFail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const q = useDriverDelivery(id);
  const [reason, setReason] = useState<Reason | null>(null);
  const [other, setOther] = useState('');
  const label = (r: Reason) => (r === 'OTHER' ? t('drvOtherReason') : t(`fr${r}`));
  const text = reason === 'OTHER' ? other.trim() : reason ? label(reason) : '';

  const send = useApiMutation(() => api(`/driver/deliveries/${id}/fail`, { body: { reason: text, expectedVersion: q.data?.order.version } }), {
    invalidate: [['driver']],
    success: t('drvFailed'),
    onSuccess: () => router.dismissTo('/driver'),
  });

  return (
    <Screen
      width="form"
      title={t('drvFail')}
      footer={<Button title={t('drvFail')} block variant="destructive" disabled={text.length < 3} loading={send.isPending} onPress={() => send.mutate(undefined)} />}
    >
      <FieldLabel>{t('drvReason')}</FieldLabel>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('drvReason')} style={{ gap: space(2) }}>
        {REASONS.map((r) => (
          <OptionCard key={r} title={label(r)} selected={reason === r} onPress={() => setReason(r)} />
        ))}
      </View>
      {reason === 'OTHER' && <Input value={other} onChangeText={setOther} multiline autoFocus placeholder={t('drvReason')} accessibilityLabel={t('drvReason')} />}
    </Screen>
  );
}
