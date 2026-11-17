import { View } from 'react-native';
import { isBlockingIssue } from '@mebel/shared';
import { Button, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { CartLine, LineIssue } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

const round = (x: number) => String(Math.round(x * 1000) / 1000);

/** Muammoni bir bosishda tuzatish: to'g'ri miqdorga keltirish yoki olib tashlash */
function fixFor(l: CartLine, i: LineIssue): string | null {
  const step = Number(l.qtyStep ?? 1);
  const min = Number(l.minQty ?? step);
  if (i.code === 'EXCEEDS_AVAILABLE') {
    const max = Math.floor(Number(i.available ?? 0) / step) * step;
    return max >= min ? round(max) : '0';
  }
  if (i.code === 'BELOW_MIN' || i.code === 'NOT_MULTIPLE_OF_STEP') return round(Math.max(min, Math.ceil(Number(l.qty) / step) * step));
  if (isBlockingIssue(i.code)) return '0';
  return null;
}

/** Savat qatoridagi muammo: sababi va uni tuzatadigan bitta tugma */
export function CartIssue({ line, issue, unit, pending, onFix }: { line: CartLine; issue: LineIssue; unit: string; pending: boolean; onFix: (qty: string) => void }) {
  const { t, errorText } = useI18n();
  const { colors } = useTheme();
  const fix = fixFor(line, issue);
  const bad = isBlockingIssue(issue.code);
  return (
    <View style={{ gap: space(2), padding: space(3), borderRadius: radius.md, backgroundColor: bad ? colors.destructiveSoft : colors.warningSoft }}>
      <Text v="small" tone={bad ? 'destructive' : 'warning'}>
        {issue.code === 'EXCEEDS_AVAILABLE' ? t('onlyAvailable', { n: `${issue.available ?? 0} ${unit}` }) : errorText(issue.code, issue.code)}
      </Text>
      {fix !== null && (
        <Button
          title={fix === '0' ? t('removeFromCart') : t('setQtyTo', { qty: `${fix} ${unit}` })}
          size="sm"
          variant="outline"
          style={{ alignSelf: 'flex-start' }}
          loading={pending}
          onPress={() => onFix(fix)}
        />
      )}
    </View>
  );
}
