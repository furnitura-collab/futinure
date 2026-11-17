import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Card, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useSite } from '@/lib/layout';
import { space } from '@/theme';

/** Ustalar uchun: artikul va miqdorni ro'yxat qilib yozib, hammasini birdan savatga qo'shish (saytda — keng banner) */
export function QuickOrderCard() {
  const { t } = useI18n();
  const { site } = useSite();
  return (
    <Card tone={site ? 'primary' : undefined} style={[{ gap: space(3) }, site && { flexDirection: 'row', alignItems: 'center', gap: space(5), padding: space(6) }]}>
      <View style={{ flex: site ? 1 : undefined, gap: 2 }}>
        <Text v={site ? 'heading' : 'body'} bold>{t('quickSku')}</Text>
        <Text v="small" muted>{t('quickSkuExplain')}</Text>
      </View>
      <Button title={t('quickSkuOpen')} variant={site ? 'primary' : 'outline'} size="md" onPress={() => router.push('/sku')} />
    </Card>
  );
}
