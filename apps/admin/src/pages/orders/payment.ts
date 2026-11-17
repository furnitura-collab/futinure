import type { Tone } from '@/components/tone';
import type { OrderCard } from '@/lib/types';

export type PayState = 'paid' | 'partial' | 'unpaid';

export const PAY_TONE: Record<PayState, Tone> = { paid: 'success', partial: 'warning', unpaid: 'neutral' };

export function payState(o: Pick<OrderCard, 'paidTotal' | 'grandTotal'>): PayState {
  if (o.paidTotal >= o.grandTotal) return 'paid';
  return o.paidTotal > 0 ? 'partial' : 'unpaid';
}
