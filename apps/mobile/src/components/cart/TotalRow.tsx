import { Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';

/** Pastki paneldagi asosiy summa: chapda izoh (nechta tovar), o'ngda katta raqam */
export function TotalRow({ label, amount }: { label: string; amount: number }) {
  const { money } = useI18n();
  return (
    <Row between>
      <Text muted>{label}</Text>
      <Text v="heading">{money(amount)}</Text>
    </Row>
  );
}
