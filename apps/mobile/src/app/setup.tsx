import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CustomerType } from '@mebel/shared';
import { Button, Input, Segmented, Text } from '../components/ui';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useApiMutation } from '../lib/mutation';
import { colors, space } from '../lib/theme';
import { contained, CONTENT } from '../lib/layout';

/** Birinchi kirishda: ism va mijoz turi (buyurtma uchun ism majburiy) */
export default function Setup() {
  const { t } = useI18n();
  const qc = useQueryClient();
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ ...contained(CONTENT.form), padding: space(6), gap: space(5) }} keyboardShouldPersistTaps="handled">
        <Text v="title">{t('setupTitle')}</Text>
        <Input label={t('fullName')} value={fullName} onChangeText={setFullName} autoFocus autoComplete="name" />
        <View style={{ gap: space(2) }}>
          <Text v="small" bold>{t('customerType')}</Text>
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: 'MASTER', label: t('typeMASTER') },
              { value: 'COMPANY', label: t('typeCOMPANY') },
              { value: 'INDIVIDUAL', label: t('typeINDIVIDUAL') },
            ]}
          />
        </View>
        {type === 'COMPANY' && (
          <>
            <Input label={t('companyName')} value={companyName} onChangeText={setCompanyName} />
            <Input label={t('inn')} value={inn} onChangeText={(v) => setInn(v.replace(/\D/g, '').slice(0, 9))} keyboardType="number-pad" />
          </>
        )}
        <Button title={t('continue')} onPress={() => save.mutate(undefined)} loading={save.isPending} disabled={!valid} />
      </ScrollView>
    </SafeAreaView>
  );
}
