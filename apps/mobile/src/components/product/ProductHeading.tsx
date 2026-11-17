import { View } from 'react-native';
import { Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { ProductDetail } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

/** Nom, brend · kategoriya va asosiy o'lchamlar (ro'yxatni ochmasdan ko'rinadi). large — saytdagi xarid bloki */
export function ProductHeading({ p, large }: { p: ProductDetail; large?: boolean }) {
  const { name } = useI18n();
  const { colors } = useTheme();
  const keySpecs = [p.board && `${p.board.lengthMm} × ${p.board.widthMm} mm`, p.board?.thicknessMm && `${Number(p.board.thicknessMm)} mm`].filter(
    (x): x is string => !!x,
  );
  return (
    <View style={{ gap: space(2) }}>
      <Text v={large ? 'display' : 'title'} accessibilityRole="header">{name(p)}</Text>
      <Text muted>{[p.brand?.name, name(p.category)].filter(Boolean).join(' · ')}</Text>
      {keySpecs.length > 0 && (
        <Row style={{ flexWrap: 'wrap' }}>
          {keySpecs.map((k) => (
            <View key={k} style={{ paddingHorizontal: space(3), paddingVertical: space(1), borderRadius: radius.full, backgroundColor: colors.muted }}>
              <Text v="small" bold>{k}</Text>
            </View>
          ))}
        </Row>
      )}
    </View>
  );
}
