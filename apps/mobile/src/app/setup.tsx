import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { CustomerType } from '@mebel/shared';
import { Button, Card, Input, Screen, Segmented, Text } from '@/components/ui';
import { AuthSplit, useAuthSplit } from '@/components/web/AuthSplit';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { space } from '@/theme';

const TYPES: CustomerType[] = ['MASTER', 'COMPANY', 'INDIVIDUAL'];

/** Birinchi kirishda: ism va mijoz turi (buyurtma uchun ism majburiy) */
export default function Setup() {
  const { t, customerType } = useI18n();
  const qc = useQueryClient();
  const split = useAuthSplit();
  const [fullName, setFullName] = useState('');
  const [type, setType] = useState<CustomerType>('MASTER');
  const [companyName, setCompanyName] = useState('');
  const [inn, setInn] = useState('');

  const save = useApiMutation(
    () =>
      api('/me', {
        method: 'PATCH',
        body: {
          fullName: fullName.trim(),
          customerType: type,
          companyName: type === 'COMPANY' ? companyName.trim() || null : null,
          inn: type === 'COMPANY' && inn ? inn : null,
        },
      }),
    { onSuccess: () => void qc.invalidateQueries({ queryKey: ['me'] }) },
  );
  const valid = fullName.trim().length >= 2 && (type !== 'COMPANY' || inn === '' || inn.length === 9);

  const content = (
    <>
      <Animated.View entering={FadeInDown.duration(250)} style={{ gap: space(1) }}>
        <Text v="title">{t('setupTitle')}</Text>
        <Text muted>{t('setupSubtitle')}</Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.duration(250).delay(80)}>
        <Card style={{ gap: space(5), padding: space(6) }}>
          <Input label={t('fullName')} icon="person-outline" value={fullName} onChangeText={setFullName} autoFocus autoComplete="name" />
          <View style={{ gap: space(2) }}>
            <Text v="small" bold>{t('customerType')}</Text>
            <Segmented value={type} onChange={setType} options={TYPES.map((c) => ({ value: c, label: customerType(c) }))} />
          </View>
          {type === 'COMPANY' && (
            <Animated.View entering={FadeInDown.duration(200)} style={{ gap: space(5) }}>
              <Input label={t('companyName')} icon="business-outline" value={companyName} onChangeText={setCompanyName} />
              <Input label={t('inn')} value={inn} onChangeText={(v) => setInn(v.replace(/\D/g, '').slice(0, 9))} keyboardType="number-pad" />
            </Animated.View>
          )}
          <Button title={t('continue')} onPress={() => save.mutate(undefined)} loading={save.isPending} disabled={!valid} />
        </Card>
      </Animated.View>
    </>
  );

  // Kompyuterda kirish ekrani bilan bir xil: chapda brend, o'ngda forma
  if (split) return <AuthSplit title={t('setupTitle')}>{content}</AuthSplit>;

  return (
    <Screen width="form" title={t('setupTitle')} contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      {content}
    </Screen>
  );
}
