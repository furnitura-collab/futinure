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
  const button = <Button title={t('quickSkuOpen')} variant={site ? 'primary' : 'outline'} size="md" onPress={() => router.push('/sku')} />;
  return (
    <Card tone={site ? 'primary' : undefined} style={[{ gap: space(3) }, site && { flexDirection: 'row', alignItems: 'center', gap: space(5), padding: space(6) }]}>
      <View style={{ flex: site ? 1 : undefined, flexDirection: 'row', gap: space(3), alignItems: site ? 'center' : 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text v={site ? 'heading' : 'body'} bold>{t('quickSku')}</Text>
          <Text v="small" muted>{t('quickSkuExplain')}</Text>
        </View>
      </View>
      {button}
    </Card>
  );
}
