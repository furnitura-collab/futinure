import { useDraggable } from '@dnd-kit/core';
import type { KeyboardEvent, MouseEvent } from 'react';
import { Link } from 'react-router';
import { formatDateTime } from '@mebel/shared';
import { Hint } from '@/components/IconButton';
import { MessageCircle, Store, Truck } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { ago, customerName } from '@/lib/format';
import type { OrderCard } from '@/lib/types';
import { cn } from '@/lib/utils';

const CARD = 'block rounded-lg border bg-card p-3 shadow-xs pointer-coarse:p-3.5';

/** Kartaning ichi — ustundagi havola va sudralayotgan nusxa (DragOverlay) uchun umumiy */
function CardBody({ order: o }: { order: OrderCard }) {
  const { t, money, label } = useI18n();
  // Shartlar saqlangan, oldindan to'lov kutilmoqda (aniq avans summasi faqat tafsilotda)
  const awaitingPayment =
    o.status === 'NEW' && (o.paymentTerms === 'PREPAID' ? o.paidTotal < o.grandTotal : o.paymentTerms === 'ADVANCE' && o.paidTotal === 0);
  const partlyPaid = o.balanceDue > 0 && o.paidTotal > 0;
  const DeliveryIcon = o.deliveryType === 'DELIVERY' ? Truck : Store;
  return (
    <>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-mono font-medium text-foreground">{o.number}</span>
        <Hint label={formatDateTime(o.updatedAt)}>
          <span>{ago(o.updatedAt, t)}</span>
        </Hint>
      </div>
      <p className="mt-1 truncate text-sm font-medium">{customerName(o.customer)}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold tabular">
          {money(o.grandTotal)}
          {partlyPaid && (
            <Hint label={t('orders.balanceHint')}>
              <span className="ml-1.5 text-xs font-medium text-warning">−{money(o.balanceDue)}</span>
            </Hint>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
          {o.unreadMessages > 0 && (
            <Hint label={t('orders.unread', { n: o.unreadMessages })}>
              <span className="flex items-center gap-0.5 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular">
                <MessageCircle className="size-3" />
                {o.unreadMessages}
              </span>
            </Hint>
          )}
          <Hint label={label('deliveryType', o.deliveryType)}>
            <span role="img" aria-label={label('deliveryType', o.deliveryType)}>
              <DeliveryIcon className="size-4" />
            </span>
          </Hint>
        </span>
      </div>
      {(awaitingPayment || !o.manager) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {awaitingPayment && <Badge variant="violet">{t('orders.awaitingPayment')}</Badge>}
          {!o.manager && <Badge variant="destructive">{t('orders.noManager')}</Badge>}
        </div>
      )}
    </>
  );
}

/** Ustundagi karta: bosilsa — buyurtma sahifasi, sudralsa — status o'tishi */
export function BoardCard({ order, movable, busy }: { order: OrderCard; movable: boolean; busy: boolean }) {
  const { t } = useI18n();
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: order.id,
    disabled: !movable || busy,
    attributes: { roleDescription: t('orders.drag.role') },
  });
  // Enter — havolani ochadi; sudrash klaviaturada Space bilan boshlanadi. Sudrab bo'lmasa — oddiy havola (aria-disabled'siz)
  const onKeyDown = (e: KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key !== 'Enter') listeners?.onKeyDown?.(e);
  };
  // Barmoq bilan bosib turish — sudrash; havola menyusi (Android/iOS) uni to'xtatmasin. Sichqoncha o'ng tugmasi saqlanadi
  const onContextMenu = (e: MouseEvent<HTMLAnchorElement>) => {
    if ('pointerType' in e.nativeEvent && e.nativeEvent.pointerType !== 'mouse') e.preventDefault();
  };
  return (
    <Link
      ref={setNodeRef}
      to={`/orders/${order.id}`}
      {...(movable && { ...attributes, ...listeners, role: undefined, onKeyDown, onContextMenu })}
      className={cn(
        CARD,
        'transition-[border-color,box-shadow,opacity] duration-150 ease-out outline-none hover:border-primary/40 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50',
        // touch-action yo'q (none emas): ustun va kanban barmoq bilan aylanaveradi, sudrash 250 ms bosib turishda
        movable && 'cursor-grab select-none [-webkit-touch-callout:none] active:cursor-grabbing',
        (isDragging || busy) && 'opacity-40',
        busy && 'animate-pulse',
      )}
    >
      <CardBody order={order} />
    </Link>
  );
}

export function BoardCardOverlay({ order }: { order: OrderCard }) {
  return (
    <div className={cn(CARD, 'w-[min(17rem,80vw)] cursor-grabbing border-primary/50 shadow-lg ring-1 ring-primary/30')}>
      <CardBody order={order} />
    </div>
  );
}
