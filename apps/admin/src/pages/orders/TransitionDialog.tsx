import { useState } from 'react';
import type { OrderStatus } from '@mebel/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { som } from '../../lib/format';
import { STATUS, TRANSITION_ACTION } from '../../lib/labels';
import { useApiMutation } from '../../lib/mutation';
import type { OrderDetail } from '../../lib/types';
import { Button, Dialog, Field, Input, Textarea } from '../../components/ui';
import { defaultTerms, TermsForm, termsPayload, type TermsValue } from './TermsForm';

/**
 * Status o'tishi. Har bir maqsadga kerakli maydonlar:
 *   CONFIRMED — to'lov shartlari; CANCELLED / qaytdi — sabab; olib ketishda DELIVERED — kim oldi.
 * Avans/kredit tekshiruvidan o'tmasa — sabab va (huquq bo'lsa) "baribir davom etish" taklif qilinadi.
 */
export function TransitionDialog({
  order,
  to,
  requiresComment,
  onClose,
}: {
  order: OrderDetail;
  to: OrderStatus;
  requiresComment: boolean;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const [comment, setComment] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [terms, setTerms] = useState<TermsValue>(() => defaultTerms(order));
  const [blocked, setBlocked] = useState<ApiError | null>(null);

  const pickupHandover = to === 'DELIVERED' && order.status === 'READY';
  const override = blocked?.code === 'ADVANCE_NOT_PAID' ? 'overrideAdvance' : blocked?.code === 'CREDIT_LIMIT_EXCEEDED' ? 'overrideCreditLimit' : null;
  const canOverride = override === 'overrideCreditLimit' || (override === 'overrideAdvance' && can('SUPER_ADMIN'));

  const mutation = useApiMutation(
    () =>
      api(`/admin/orders/${order.id}/transition`, {
        body: {
          to,
          expectedVersion: order.version,
          comment: comment.trim() || undefined,
          ...(to === 'CONFIRMED' && { terms: termsPayload(terms) }),
          ...(pickupHandover && { receiverName: receiverName.trim() }),
          ...(override && { [override]: true }),
        },
      }),
    {
      invalidate: [['order', order.id], ['orders']],
      success: `${order.number}: ${STATUS[to].label}`,
      onSuccess: onClose,
      silentCodes: ['ADVANCE_NOT_PAID', 'CREDIT_LIMIT_EXCEEDED'],
    },
  );

  const submit = () => {
    setBlocked(null);
    mutation.mutate(undefined, {
      onError: (e) => {
        if (e instanceof ApiError && (e.code === 'ADVANCE_NOT_PAID' || e.code === 'CREDIT_LIMIT_EXCEEDED')) setBlocked(e);
      },
    });
  };

  const needComment = requiresComment || (!!override && blocked !== null);
  const valid = (!needComment || comment.trim().length >= 3) && (!pickupHandover || receiverName.trim().length >= 2);
  const itemsTotal = order.items.filter((i) => i.status === 'ACTIVE').reduce((s, i) => s + i.lineTotal, 0);

  return (
    <Dialog
      open
      onClose={onClose}
      wide={to === 'CONFIRMED'}
      title={`${order.number}: ${TRANSITION_ACTION[to] ?? STATUS[to].label}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Bekor</Button>
          <Button
            variant={to === 'CANCELLED' ? 'danger' : 'primary'}
            loading={mutation.isPending}
            disabled={!valid || (!!blocked && !canOverride)}
            onClick={submit}
          >
            {blocked && canOverride ? 'Baribir davom etish' : (TRANSITION_ACTION[to] ?? 'Saqlash')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {to === 'CONFIRMED' && (
          <>
            <p className="text-sm text-stone-600">
              Buyurtma o'zgarishsiz tasdiqlanadi va tovar omborda band qilinadi. Miqdor yoki narxni o'zgartirish kerak bo'lsa — "Taklif yuborish".
            </p>
            <TermsForm value={terms} onChange={setTerms} order={order} itemsTotal={itemsTotal} />
          </>
        )}

        {pickupHandover && (
          <Field label="Tovarni kim olib ketdi">
            {(id) => <Input id={id} autoFocus value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="Ism" />}
          </Field>
        )}

        {blocked && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            {blocked.code === 'ADVANCE_NOT_PAID' ? (
              <>
                Avans to'lanmagan: kerak {som((blocked.details as { required: number }).required)}, to'langan{' '}
                {som((blocked.details as { paid: number }).paid)}.
                {canOverride ? ' Izoh yozib davom etishingiz mumkin.' : ' Faqat super admin chetlab o\'ta oladi.'}
              </>
            ) : (
              <>
                Kredit limitidan oshadi: limit {som((blocked.details as { creditLimit: number }).creditLimit)}, buyurtmadan keyin qarz{' '}
                {som((blocked.details as { exposure: number }).exposure)}. Izoh yozib tasdiqlang.
              </>
            )}
          </div>
        )}

        {(requiresComment || to === 'CANCELLED' || blocked || to !== 'CONFIRMED') && (
          <Field label={needComment ? 'Sabab / izoh (majburiy)' : 'Izoh'}>
            {(id) => <Textarea id={id} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />}
          </Field>
        )}

        {to === 'CANCELLED' && order.paidTotal > 0 && (
          <p className="text-sm text-amber-700">
            Mijoz {som(order.paidTotal)} to'lagan. Pul uning balansida qoladi — qaytarish mijoz sahifasidan qilinadi.
          </p>
        )}
      </div>
    </Dialog>
  );
}
