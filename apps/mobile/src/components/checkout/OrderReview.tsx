import { router } from 'expo-router';
import { View } from 'react-native';
import { SumRow } from '@/components/order/SumRow';
import { Button, Card, Text } from '@/components/ui';
import { useI18n, type I18nKey } from '@/i18n';
import { space } from '@/theme';

const NEXT: I18nKey[] = ['whatNext1', 'whatNext2', 'whatNext3'];

/** Buyurtma tarkibi: tovarlar summasi, yetkazish narxi va savatga qaytish */
export function OrderReview({ count, total, pickup }: { count: number; total: number; pickup: boolean }) {
  const { t, money } = useI18n();
  return (
    <Card style={{ gap: space(2) }}>
      <Text v="h2">{t('reviewTitle')}</Text>
      <SumRow label={t('itemsCount', { n: count })} value={money(total)} />
      <SumRow label={t('deliveryFee')} value={pickup ? t('free') : t('byManager')} />
      <Button title={t('editCart')} variant="ghost" size="sm" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => router.back()} />
    </Card>
  );
}

/** "Yuborganingizdan keyin" — keyingi qadamlar raqamlangan, oddiy til bilan */
export function WhatNext() {
  const { t } = useI18n();
  return (
    <Card tone="info" style={{ gap: space(2) }}>
      <Text bold tone="info">{t('whatNextTitle')}</Text>
      {NEXT.map((k, i) => (
        <View key={k} style={{ flexDirection: 'row', gap: space(2), alignItems: 'flex-start' }}>
          <Text v="small" bold>{i + 1}.</Text>
          <Text v="small" style={{ flex: 1 }}>{t(k)}</Text>
        </View>
      ))}
    </Card>
  );
}
