import { View } from 'react-native';
import { IconButton, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { addQty, useSetCartItem } from '@/lib/cart';
import type { CartLine } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

const SIZE = 40;

/**
 * Kartadagi miqdor: savatda bo'lmasa — faqat "+", bo'lsa — [− son +].
 * "−" savatdagi qatorning o'z qadami bilan kamaytiradi; minimaldan pastga tushsa — savatdan olinadi.
 */
export function CardQtyControl({
  line,
  addLabel,
  disabled,
  onAdd,
}: {
  line?: CartLine;
  addLabel: string;
  disabled?: boolean;
  onAdd: () => void;
}) {
  const { t, unit } = useI18n();
  const { colors, shadow } = useTheme();
  const set = useSetCartItem();

  const plus = <IconButton icon="plus" variant="primary" size={SIZE} label={addLabel} disabled={disabled || set.isPending} onPress={onAdd} />;
  if (!line) return <View style={{ borderRadius: radius.full, ...shadow }}>{plus}</View>;

  const step = line.qtyStep ?? '1';
  const next = addQty(line.qty, `-${step}`);
  const remove = Number(next) < Number(line.minQty ?? step);
  const decrease = () => set.mutate({ variantId: line.variantId, qty: remove ? '0' : next });

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.full, backgroundColor: colors.primary, ...shadow }}
      accessibilityLabel={`${line.qty} ${line.unit ? unit(line.unit) : ''}`.trim()}
    >
      <IconButton
        icon={remove ? 'trash' : 'minus'}
        variant="primary"
        size={SIZE}
        label={remove ? t('removeFromCart') : t('qtyDecrease')}
        disabled={set.isPending}
        onPress={decrease}
      />
      <Text bold color={colors.primaryForeground} style={{ minWidth: space(5), textAlign: 'center' }} numberOfLines={1}>
        {line.qty}
      </Text>
      {plus}
    </View>
  );
}
