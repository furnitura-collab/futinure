import { Row, Text } from '@/components/ui';
import type { Tone } from '@/theme';

/** "Nomi ........ summa" qatori (jami, yetkazish, chegirma) */
export function SumRow({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: Tone }) {
  const v = bold ? 'h2' : 'body';
  return (
    <Row between>
      <Text muted={!bold} bold={bold} v={v}>{label}</Text>
      <Text bold={bold} v={v} tone={tone} style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
    </Row>
  );
}
