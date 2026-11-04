import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { addDays, businessDate, formatDate, isValidIsoDate, MAX_DELIVERY_DAYS_AHEAD } from '@mebel/shared';
import { Chip, Input } from '@/components/ui';
import { useI18n } from '@/i18n';
import { space } from '@/theme';

/** Server qoidasi bilan bir xil: bugundan 60 kungacha; bo'sh — ixtiyoriy */
export const isValidChoice = (d: string) => {
  const today = businessDate();
  return !d || (isValidIsoDate(d) && d >= today && d <= addDays(today, MAX_DELIVERY_DAYS_AHEAD));
};

/** Sana: tez tanlov (ertaga, indinga, 3 kundan keyin) yoki qo'lda; bo'sh — "menejer bilan kelishamiz" */
export function DateChoice({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const { t } = useI18n();
  const today = businessDate();
  const quick = [
    { label: t('dateAny'), value: '' },
    { label: t('dateTomorrow'), value: addDays(today, 1) },
    { label: t('dateAfterTomorrow'), value: addDays(today, 2) },
    { label: formatDate(addDays(today, 3)), value: addDays(today, 3) },
  ];
  const [custom, setCustom] = useState(false);
  const isQuick = quick.some((q) => q.value === value);

  return (
    <View style={{ gap: space(3) }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space(4) }} contentContainerStyle={{ gap: space(2), paddingHorizontal: space(4) }}>
        {quick.map((q) => (
          <Chip
            key={q.label}
            label={q.label}
            active={!custom && q.value === value}
            onPress={() => {
              setCustom(false);
              onChange(q.value);
            }}
          />
        ))}
        <Chip label={t('dateOther')} icon="calendar-outline" active={custom || !isQuick} onPress={() => setCustom(true)} />
      </ScrollView>
      {(custom || !isQuick) && (
        <Input
          icon="calendar-outline"
          value={value}
          onChangeText={onChange}
          placeholder={addDays(today, 5)}
          error={isValidChoice(value) ? null : t('dateInvalid', { days: MAX_DELIVERY_DAYS_AHEAD })}
          hint={t('dateFormat')}
          keyboardType="numbers-and-punctuation"
        />
      )}
    </View>
  );
}
