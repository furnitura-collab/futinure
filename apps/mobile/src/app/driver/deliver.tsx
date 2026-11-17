import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { AttachmentField } from '@/components/form/AttachmentField';
import { Button, Card, Input, Screen, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, fileToForm } from '@/lib/api';
import { useDriverDelivery } from '@/lib/driver';
import { useApiMutation } from '@/lib/mutation';
import type { Picked } from '@/lib/pick';
import { font, space } from '@/theme';

/** Topshirish: kim qabul qildi, olingan naqd pul, surat — bitta asosiy tugma */
export default function DriverDeliver() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, money } = useI18n();
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

  return (
    <Screen
      width="form"
      title={q.data?.order.number}
      footer={
        <Button
          title={t('drvDeliver')}
          block
          disabled={!q.data || receiver.trim().length < 2 || cashNum > toCollect}
          loading={send.isPending}
          onPress={() => send.mutate(undefined)}
        />
      }
    >
      {toCollect > 0 && (
        <Card tone="warning" style={{ gap: 2 }}>
          <Text v="small" muted>{t('drvToCollect')}</Text>
          <Text v="title">{money(toCollect)}</Text>
        </Card>
      )}
      <Card style={{ gap: space(4) }}>
        <Input label={t('drvReceiver')} value={receiver} onChangeText={setReceiver} autoCapitalize="words" autoComplete="name" autoFocus />
        {toCollect > 0 && (
          <Input
            label={t('drvCash')}
            value={cashValue}
            onChangeText={(v) => setCash(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            error={cashNum > toCollect ? t('drvCashTooMuch') : null}
            style={{ fontSize: font.xl, fontWeight: '600' }}
          />
        )}
      </Card>
      <AttachmentField label={t('drvPhoto')} value={photo} onChange={setPhoto} quality={0.6} />
      <Input label={t('comment')} value={comment} onChangeText={setComment} multiline />
    </Screen>
  );
}
