import { Row, Text } from '@/components/ui';
import type { Tone } from '@/theme';

/** "Nomi ........ summa" qatori (jami, yetkazish, chegirma) */
export function SumRow({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: Tone }) {
  return (
    <Row between>
      <Text muted={!bold} bold={bold} v={bold ? 'h2' : 'body'}>{label}</Text>
      <Text bold={bold} v={bold ? 'h2' : 'body'} tone={tone}>{value}</Text>
    </Row>
  );
}
