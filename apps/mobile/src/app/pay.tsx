import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { Button, Card, Input, Ionicons, Loader, Row, Segmented, Text, useToast } from '../components/ui';
import { api, fileToForm } from '../lib/api';
import { som } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useApiMutation } from '../lib/mutation';
import { colors, radius, space } from '../lib/theme';
import type { Balance, OrderDetail, PaymentInfo } from '../lib/types';
import { contained, CONTENT } from '../lib/layout';

interface Picked {
  uri: string;
  name: string;
  mimeType: string;
  file?: Blob;
}

/**
 * To'lov haqida xabar: buyurtma uchun (?orderId=) yoki umumiy qarzga.
 * Mijoz kartaga o'tkazadi va chekni yuklaydi — menejer tekshirib tasdiqlaydi.
 */
export default function Pay() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const { t, locale, method } = useI18n();
  const toast = useToast();
  const info = useQuery({ queryKey: ['payment-info'], queryFn: () => api<PaymentInfo>('/payment-info'), staleTime: 10 * 60_000 });
  const order = useQuery({ queryKey: ['order', orderId], queryFn: () => api<OrderDetail>(`/orders/${orderId}`), enabled: !!orderId });
  const balance = useQuery({ queryKey: ['balance'], queryFn: () => api<Balance>('/me/balance'), enabled: !orderId });

  const allowed = (orderId ? order.data?.allowedMethods : balance.data?.allowedPaymentMethods) ?? [];
  const methods = (['CARD_TRANSFER', 'BANK_TRANSFER'] as const).filter((m) => allowed.length === 0 || allowed.includes(m));
  const due = orderId ? (order.data?.balanceDue ?? 0) : Math.max(0, balance.data?.balance ?? 0);
  const suggested = orderId && order.data?.paymentTerms === 'ADVANCE' && order.data.paidTotal < order.data.advanceAmount
    ? order.data.advanceAmount - order.data.paidTotal
    : due;

  const [amount, setAmount] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<'CARD_TRANSFER' | 'BANK_TRANSFER'>('CARD_TRANSFER');
  const [file, setFile] = useState<Picked | null>(null);
  const value = amount ?? (suggested ? String(suggested) : '');
  const amountNum = Number(value.replace(/\D/g, ''));

  const send = useApiMutation(
    async () => {
      const { id } = await api<{ id: string }>('/uploads/receipts', { form: await fileToForm(file!) });
      const body = { amount: amountNum, method: payMethod, receiptUploadId: id };
      return orderId ? api(`/orders/${orderId}/payments`, { body }) : api('/me/payments', { body });
    },
    {
      invalidate: [['order', orderId], ['balance'], ['orders']],
      success: t('paymentSent'),
      onSuccess: () => router.back(),
    },
  );

  const pickImage = async (camera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
    }
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const a = r.assets?.[0];
    if (!r.canceled && a) setFile({ uri: a.uri, name: a.fileName ?? 'chek.jpg', mimeType: a.mimeType ?? 'image/jpeg', file: a.file });
  };
  const pickPdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    const a = r.assets?.[0];
    if (!r.canceled && a) setFile({ uri: a.uri, name: a.name, mimeType: 'application/pdf', file: a.file });
  };

  if (info.isPending || (orderId ? order.isPending : balance.isPending)) return <Loader />;
  const card = info.data?.card;
  const bank = info.data?.bank;

  return (
    <ScrollView contentContainerStyle={{ ...contained(CONTENT.page), padding: space(4), gap: space(4) }} keyboardShouldPersistTaps="handled">
      <Text muted>{t('payHint')}</Text>
      {orderId && order.data && (
        <Text>
          {order.data.number} · {t('due')}: <Text bold>{som(due, locale)}</Text>
        </Text>
      )}

      {methods.length > 1 && (
        <Segmented value={payMethod} onChange={setPayMethod} options={methods.map((m) => ({ value: m, label: method(m) }))} />
      )}

      {payMethod === 'CARD_TRANSFER' && card ? (
        <Card style={{ gap: 4, backgroundColor: colors.brandBg, borderColor: colors.brandSoft }}>
          <Text v="caption">{t('cardNumber')}</Text>
          <Pressable
            onPress={() => {
              void Clipboard.setStringAsync(card.number.replace(/\s/g, ''));
              toast(t('copied'), 'success');
            }}
          >
            <Row>
              <Text v="title" style={{ letterSpacing: 1 }}>{card.number}</Text>
              <Ionicons name="copy-outline" size={20} color={colors.brand} />
            </Row>
          </Pressable>
          <Text v="small">{card.holder}</Text>
        </Card>
      ) : bank ? (
        <Card style={{ gap: 4 }}>
          <Text bold>{bank.name}</Text>
          <Text v="small">h/r {bank.account}</Text>
          <Text v="small">MFO {bank.mfo} · STIR {bank.inn}</Text>
        </Card>
      ) : null}

      <Input label={t('amount')} value={value} onChangeText={setAmount} keyboardType="number-pad" />

      <View style={{ gap: space(2) }}>
        <Text v="small" bold>{t('receipt')}</Text>
        {file ? (
          <View style={{ borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
            {file.mimeType.startsWith('image/') ? (
              <Image source={{ uri: file.uri }} style={{ height: 220 }} contentFit="contain" />
            ) : (
              <Row style={{ padding: space(4) }}>
                <Ionicons name="document-text-outline" size={28} color={colors.brand} />
                <Text>{file.name}</Text>
              </Row>
            )}
            <Button title="✕" variant="ghost" small onPress={() => setFile(null)} />
          </View>
        ) : (
          <Row>
            {Platform.OS !== 'web' && <Button title={t('takePhoto')} icon="camera-outline" variant="secondary" small style={{ flex: 1 }} onPress={() => void pickImage(true)} />}
            <Button title={t('pickPhoto')} icon="image-outline" variant="secondary" small style={{ flex: 1 }} onPress={() => void pickImage(false)} />
            <Button title={t('pickPdf')} icon="document-outline" variant="secondary" small onPress={() => void pickPdf()} />
          </Row>
        )}
      </View>

      <Button
        title={t('send')}
        disabled={!file || amountNum <= 0 || amountNum > due}
        loading={send.isPending}
        onPress={() => send.mutate(undefined)}
      />
    </ScrollView>
  );
}
