import type { ReactNode } from 'react';
import type { DeliveryStatus, OrderStatus, PaymentStatus, QuoteStatus, StockLevel } from '@mebel/shared';
import { useI18n } from '@/i18n';
import { Badge } from '@/components/ui/badge';
import type { Tone } from './tone';

const ORDER_TONE: Record<OrderStatus, Tone> = {
  NEW: 'info',
  QUOTED: 'violet',
  CONFIRMED: 'primary',
  PREPARING: 'warning',
  READY: 'teal',
  OUT_FOR_DELIVERY: 'info',
  DELIVERED: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'destructive',
};

const PAYMENT_TONE: Record<PaymentStatus, Tone> = { PENDING: 'warning', CONFIRMED: 'success', REJECTED: 'destructive' };
const DELIVERY_TONE: Record<DeliveryStatus, Tone> = { ASSIGNED: 'info', IN_TRANSIT: 'teal', DELIVERED: 'success', FAILED: 'destructive' };
const QUOTE_TONE: Record<QuoteStatus, Tone> = { PENDING: 'violet', ACCEPTED: 'success', REJECTED: 'destructive', SUPERSEDED: 'neutral', EXPIRED: 'neutral' };
const STOCK_TONE: Record<StockLevel, Tone> = { IN_STOCK: 'success', LOW: 'warning', ON_ORDER: 'info', OUT_OF_STOCK: 'destructive' };

type StatusProps =
  | { kind: 'orderStatus'; value: OrderStatus }
  | { kind: 'paymentStatus'; value: PaymentStatus }
  | { kind: 'deliveryStatus'; value: DeliveryStatus }
  | { kind: 'quoteStatus'; value: QuoteStatus }
  | { kind: 'stockLevel'; value: StockLevel };

type Props = (StatusProps | { kind?: undefined; tone: Tone; children: ReactNode }) & { className?: string };

/** Holat nishoni: matn @mebel/shared tarjimasidan, rang — holatdan */
export function StatusBadge(props: Props) {
  const { label } = useI18n();
  if (props.kind === undefined) return <Badge variant={props.tone} className={props.className}>{props.children}</Badge>;

  let tone: Tone;
  let text: string;
  switch (props.kind) {
    case 'orderStatus':
      tone = ORDER_TONE[props.value];
      text = label('orderStatus', props.value);
      break;
    case 'paymentStatus':
      tone = PAYMENT_TONE[props.value];
      text = label('paymentStatus', props.value);
      break;
    case 'deliveryStatus':
      tone = DELIVERY_TONE[props.value];
      text = label('deliveryStatus', props.value);
      break;
    case 'quoteStatus':
      tone = QUOTE_TONE[props.value];
      text = label('quoteStatus', props.value);
      break;
    case 'stockLevel':
      tone = STOCK_TONE[props.value];
      text = label('stockLevel', props.value);
      break;
  }
  return (
    <Badge variant={tone} className={props.className}>
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
      {text}
    </Badge>
  );
}
