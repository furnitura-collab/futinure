import { useState } from 'react';
import type { OrderStatus } from '@mebel/shared';
import { Callout } from '@/components/Callout';
import { FormDialog } from '@/components/FormDialog';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import type { OrderDetail } from '@/lib/types';
import { defaultTerms, requiredPrepayment, TermsForm, termsGrandTotal, termsPayload, type TermsValue } from './TermsForm';

type Blocked =
  | { code: 'ADVANCE_NOT_PAID'; required: number; paid: number }
  | { code: 'CREDIT_LIMIT_EXCEEDED'; creditLimit: number; exposure: number };

function num(details: unknown, key: string): number {
  const v = details && typeof details === 'object' ? (details as Record<string, unknown>)[key] : undefined;
  return typeof v === 'number' ? v : 0;
}

function toBlocked(e: unknown): Blocked | null {
  if (!(e instanceof ApiError)) return null;
  if (e.code === 'ADVANCE_NOT_PAID') return { code: e.code, required: num(e.details, 'required'), paid: num(e.details, 'paid') };
  if (e.code === 'CREDIT_LIMIT_EXCEEDED') return { code: e.code, creditLimit: num(e.details, 'creditLimit'), exposure: num(e.details, 'exposure') };
  return null;
}

const sameTerms = (a: TermsValue, b: TermsValue) => JSON.stringify(termsPayload(a)) === JSON.stringify(termsPayload(b));

/**
 * Status o'tishi. Har bir maqsadga kerakli maydonlar:
 *   qabul qilish (NEW → PREPARING) — to'lov shartlari; CANCELLED / qaytdi — sabab; olib ketishda DELIVERED — kim oldi.
 * Oldindan to'lovda (PREPAID/ADVANCE, hali to'lanmagan) — "Shartlarni saqlash": status NEW qoladi, mijoz to'laydi.
 * Avans/kredit tekshiruvidan o'tmasa — sabab ko'rsatiladi va (huquq bo'lsa) izoh bilan "baribir davom etish" mumkin.
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
  const { t, money, label } = useI18n();
  const { can } = useAuth();
  const [comment, setComment] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [terms, setTerms] = useState<TermsValue>(() => defaultTerms(order));
  const [blocked, setBlocked] = useState<Blocked | null>(null);

  const accept = to === 'PREPARING' && order.status === 'NEW';
  const pickupHandover = to === 'DELIVERED' && order.status === 'READY';
  const override = blocked?.code === 'ADVANCE_NOT_PAID' ? 'overrideAdvance' : blocked ? 'overrideCreditLimit' : null;
  const canOverride = override === 'overrideCreditLimit' || (override === 'overrideAdvance' && can('SUPER_ADMIN'));
  const actionLabel = accept ? t('order.accept') : t(`order.action.${to}`);
  // Shartlar oldin saqlangan va o'zgarmagan bo'lsa — qayta yuborilmaydi
  const termsChanged = !order.paymentTerms || !sameTerms(terms, defaultTerms(order));
  const required = requiredPrepayment(terms.paymentTerms, termsGrandTotal(order, terms), terms.advanceAmount);
  const prepayPending = accept && order.canSetTerms && required > order.paidTotal;
  // Saqlangan shartlar o'zgarmagan bo'lsa qayta saqlash (va mijozga qayta xabar) shart emas
  const offerSave = prepayPending && termsChanged;

  const mutation = useApiMutation(
    () =>
      api(`/admin/orders/${order.id}/transition`, {
        body: {
          to,
          expectedVersion: order.version,
          comment: comment.trim() || undefined,
          ...(accept && termsChanged && { terms: termsPayload(terms) }),
          ...(pickupHandover && { receiverName: receiverName.trim() }),
          ...(override && { [override]: true }),
        },
      }),
    {
      invalidate: [['order', order.id], ['orders']],
      success: t('transition.done', { number: order.number, status: label('orderStatus', to) }),
      onSuccess: onClose,
      silentCodes: ['ADVANCE_NOT_PAID', 'CREDIT_LIMIT_EXCEEDED'],
    },
  );

  const saveTerms = useApiMutation(
    () => api(`/admin/orders/${order.id}/terms`, { method: 'PUT', body: { terms: termsPayload(terms), expectedVersion: order.version } }),
    { invalidate: [['order', order.id], ['orders']], success: t('transition.termsSaved', { number: order.number }), onSuccess: onClose },
  );

  const submit = () => {
    setBlocked(null);
    mutation.mutate(undefined, { onError: (e) => setBlocked(toBlocked(e)) });
  };

  const changeTerms = (v: TermsValue) => {
    setTerms(v);
    setBlocked(null);
  };

  const needComment = requiresComment || !!blocked;
  const valid = (!needComment || comment.trim().length >= 3) && (!pickupHandover || receiverName.trim().length >= 2);
  const busy = mutation.isPending || saveTerms.isPending;

  return (
    <FormDialog
      onClose={onClose}
      size={accept ? 'lg' : 'md'}
      title={`${order.number}: ${actionLabel}`}
      description={accept ? t('transition.acceptHint') : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {offerSave && (
            <Button loading={saveTerms.isPending} disabled={busy} onClick={() => saveTerms.mutate(undefined)}>
              {t('order.saveTerms')}
            </Button>
          )}
          <Button
            variant={to === 'CANCELLED' ? 'destructive' : offerSave ? 'outline' : 'default'}
            loading={mutation.isPending}
            disabled={busy || !valid || (!!blocked && !canOverride)}
            onClick={submit}
          >
            {blocked && canOverride ? t('transition.override') : actionLabel}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {accept && <TermsForm value={terms} onChange={changeTerms} order={order} />}

        {offerSave && !blocked && <Callout tone="info">{t('transition.prepayHint')}</Callout>}

        {pickupHandover && (
          <FormField label={t('transition.receiver')}>
            {(f) => <Input {...f} autoFocus value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder={t('transition.receiverPlaceholder')} />}
          </FormField>
        )}

        {blocked && (
          <Callout tone="warning">
            {blocked.code === 'ADVANCE_NOT_PAID'
              ? `${t('transition.advanceNotPaid', { required: money(blocked.required), paid: money(blocked.paid) })} ${canOverride ? t('transition.canOverride') : t('transition.onlySuperAdmin')}`
              : t('transition.creditExceeded', { limit: money(blocked.creditLimit), exposure: money(blocked.exposure) })}
          </Callout>
        )}

        {(needComment || !accept) && (
          <FormField label={needComment ? t('transition.reasonRequired') : t('common.comment')}>
            {(f) => <Textarea {...f} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />}
          </FormField>
        )}

        {to === 'CANCELLED' && order.paidTotal > 0 && <Callout tone="warning">{t('transition.refundNote', { amount: money(order.paidTotal) })}</Callout>}
      </div>
    </FormDialog>
  );
}
