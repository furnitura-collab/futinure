import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AttachmentField } from '@/components/form/AttachmentField';
import { Button, Card, IconButton, Input, Screen, Segmented, SkeletonList, Text, useToast } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, fileToForm } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import type { Picked } from '@/lib/pick';
import type { Balance, OrderDetail, PaymentInfo } from '@/lib/types';
import { space } from '@/theme';

type PayMethod = 'CARD_TRANSFER' | 'BANK_TRANSFER';

/**
 * To'lov haqida xabar: buyurtma uchun (?orderId=) yoki umumiy qarzga.
 * Mijoz kartaga o'tkazadi va chekni yuklaydi — menejer tekshirib tasdiqlaydi.
 */
export default function Pay() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const { t, money, method } = useI18n();
  const toast = useToast();
  const info = useQuery({ queryKey: ['payment-info'], queryFn: () => api<PaymentInfo>('/payment-info'), staleTime: 10 * 60_000 });
  const order = useQuery({ queryKey: ['order', orderId], queryFn: () => api<OrderDetail>(`/orders/${orderId}`), enabled: !!orderId });
  const balance = useQuery({ queryKey: ['balance'], queryFn: () => api<Balance>('/me/balance'), enabled: !orderId });

  const allowed = (orderId ? order.data?.allowedMethods : balance.data?.allowedPaymentMethods) ?? [];
  const methods = (['CARD_TRANSFER', 'BANK_TRANSFER'] as const).filter((m) => allowed.length === 0 || allowed.includes(m));
  const due = orderId ? (order.data?.balanceDue ?? 0) : Math.max(0, balance.data?.balance ?? 0);
  const o = order.data;
  // Avans hali to'liq to'lanmagan bo'lsa — avans qoldig'ini taklif qilamiz
  const suggested = orderId && o?.paymentTerms === 'ADVANCE' && o.paidTotal < o.advanceAmount ? o.advanceAmount - o.paidTotal : due;

  const [amount, setAmount] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>('CARD_TRANSFER');
  const [file, setFile] = useState<Picked | null>(null);
  const value = amount ?? (suggested ? String(suggested) : '');
  const amountNum = Number(value.replace(/\D/g, ''));

  const send = useApiMutation(
    async () => {
      if (!file) return;
      const { id } = await api<{ id: string }>('/uploads/receipts', { form: await fileToForm(file) });
      const body = { amount: amountNum, method: payMethod, receiptUploadId: id };
      return orderId ? api(`/orders/${orderId}/payments`, { body }) : api('/me/payments', { body });
    },
    {
      invalidate: [['order', orderId], ['balance'], ['orders']],
      success: t('paymentSent'),
      onSuccess: () => router.back(),
    },
  );

  const loading = info.isPending || (orderId ? order.isPending : balance.isPending);
  const card = info.data?.card;
  const bank = info.data?.bank;

  return (
    <Screen
      modal
      title={t('payTitle')}
      footer={
        <Button
          title={t('send')}
          block
          disabled={loading || !file || amountNum <= 0 || amountNum > due}
          loading={send.isPending}
          onPress={() => send.mutate(undefined)}
        />
      }
    >
      {loading ? (
        <SkeletonList count={2} />
      ) : (
        <>
          <View style={{ gap: 2 }}>
            <Text v="small" muted>{o ? `${o.number} · ${t('toPayNow')}` : t('toPayNow')}</Text>
            <Text v="display" style={{ fontVariant: ['tabular-nums'] }}>{money(due)}</Text>
            <Text v="small" muted>{t('payHint')}</Text>
          </View>

          {methods.length > 1 && <Segmented value={payMethod} onChange={setPayMethod} options={methods.map((m) => ({ value: m, label: method(m) }))} />}

          {payMethod === 'CARD_TRANSFER' && card ? (
            <Card tone="primary" style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text v="caption" tone="primary">{t('cardNumber')}</Text>
                <Text v="heading" style={{ letterSpacing: 1.5, fontVariant: ['tabular-nums'] }} selectable>{card.number}</Text>
                <Text v="small">{card.holder}</Text>
              </View>
              <IconButton
                icon="copy"
                label={t('copyCard')}
                onPress={() => {
                  void Clipboard.setStringAsync(card.number.replace(/\s/g, ''));
                  toast(t('copied'), 'success');
                }}
              />
            </Card>
          ) : bank ? (
            <Card style={{ gap: 2 }}>
              <Text bold>{bank.name}</Text>
              <Text v="small" selectable>{`${t('bankAccount')} ${bank.account}`}</Text>
              <Text v="small" selectable>{`${t('bankMfo')} ${bank.mfo} · ${t('bankInn')} ${bank.inn}`}</Text>
            </Card>
          ) : null}

          <Input label={t('amount')} value={value} onChangeText={setAmount} keyboardType="number-pad" />
          <AttachmentField label={t('receipt')} value={file} onChange={setFile} allowPdf />
        </>
      )}
    </Screen>
  );
}
