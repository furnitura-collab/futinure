import type { OrderStatus } from '@mebel/shared';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import type { OrderDetail } from '@/lib/types';
import { cn } from '@/lib/utils';
import { orderFlow } from './progress';

export type Transition = OrderDetail['availableTransitions'][number];

/** Asosiy amallar (qabul qilish, tayyor, yetkazildi) va bekor qilish; `bar` — telefondagi pastki panel uchun */
function ActionButtons({ order, onPick, bar }: { order: OrderDetail; onPick: (tr: Transition) => void; bar?: boolean }) {
  const { t } = useI18n();
  const forward = order.availableTransitions.filter((tr) => tr.to !== 'CANCELLED');
  const cancel = order.availableTransitions.find((tr) => tr.to === 'CANCELLED');
  const { flow, current } = orderFlow(order);
  const back = (to: OrderStatus) => flow.indexOf(to) < current;
  const actionText = (to: OrderStatus) =>
    order.status === 'NEW' && to === 'PREPARING'
      ? t('order.accept')
      : order.status === 'OUT_FOR_DELIVERY' && to === 'READY'
        ? t('order.notDelivered')
        : t(`order.action.${to}`);
  // Panelda amallar kenglikni teng bo'lishadi; ortga qaytarish (yetkazilmadi) — ikkinchi darajali
  return (
    <>
      {cancel && (
        <Button variant="ghost-destructive" onClick={() => onPick(cancel)}>
          {t('order.action.CANCELLED')}
        </Button>
      )}
      {forward.map((tr) => (
        <Button key={tr.to} variant={back(tr.to) ? 'outline' : 'default'} className={cn(bar && 'min-w-0 flex-1')} onClick={() => onPick(tr)}>
          <span className="truncate">{actionText(tr.to)}</span>
        </Button>
      ))}
    </>
  );
}

/** Kompyuterda — sarlavhada (lg va katta) */
export function HeaderActions(props: { order: OrderDetail; onPick: (tr: Transition) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 max-lg:hidden">
      <ActionButtons {...props} />
    </div>
  );
}

/**
 * Telefon va planshetda (< lg) — pastki tab bar ustida yopishgan shisha panel.
 * Ekran klaviaturasi ochiq (matn maydoni fokusda) — panel yashiriladi, chat yozishga joy qoladi.
 */
export function ActionBar(props: { order: OrderDetail; onPick: (tr: Transition) => void }) {
  const { t } = useI18n();
  return (
    <div
      role="toolbar"
      aria-label={t('order.actions')}
      className="glass fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 flex gap-2 border-t px-3 py-2 sm:px-5 lg:hidden [body:has(:is(input,textarea):focus)_&]:hidden"
    >
      <ActionButtons {...props} bar />
    </div>
  );
}
