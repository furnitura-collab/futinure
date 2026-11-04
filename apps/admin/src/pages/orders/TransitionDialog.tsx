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
import { defaultTerms, TermsForm, termsPayload, type TermsValue } from './TermsForm';

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
  const { t, money, label } = useI18n();
  const { can } = useAuth();
  const [comment, setComment] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [terms, setTerms] = useState<TermsValue>(() => defaultTerms(order));
  const [blocked, setBlocked] = useState<Blocked | null>(null);

  const pickupHandover = to === 'DELIVERED' && order.status === 'READY';
  const override = blocked?.code === 'ADVANCE_NOT_PAID' ? 'overrideAdvance' : blocked ? 'overrideCreditLimit' : null;
  const canOverride = override === 'overrideCreditLimit' || (override === 'overrideAdvance' && can('SUPER_ADMIN'));
  const actionLabel = t(`order.action.${to}`);

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
      success: t('transition.done', { number: order.number, status: label('orderStatus', to) }),
      onSuccess: onClose,
      silentCodes: ['ADVANCE_NOT_PAID', 'CREDIT_LIMIT_EXCEEDED'],
    },
  );

  const submit = () => {
    setBlocked(null);
    mutation.mutate(undefined, { onError: (e) => setBlocked(toBlocked(e)) });
  };

  const needComment = requiresComment || !!blocked;
  const valid = (!needComment || comment.trim().length >= 3) && (!pickupHandover || receiverName.trim().length >= 2);
  const itemsTotal = order.items.filter((i) => i.status === 'ACTIVE').reduce((s, i) => s + i.lineTotal, 0);

  return (
    <FormDialog
      onClose={onClose}
      size={to === 'CONFIRMED' ? 'lg' : 'md'}
      title={`${order.number}: ${actionLabel}`}
      description={to === 'CONFIRMED' ? t('transition.confirmHint') : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={to === 'CANCELLED' ? 'destructive' : 'default'}
            loading={mutation.isPending}
            disabled={!valid || (!!blocked && !canOverride)}
            onClick={submit}
          >
            {blocked && canOverride ? t('transition.override') : actionLabel}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {to === 'CONFIRMED' && <TermsForm value={terms} onChange={setTerms} order={order} itemsTotal={itemsTotal} />}

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

        {(needComment || to !== 'CONFIRMED') && (
          <FormField label={needComment ? t('transition.reasonRequired') : t('common.comment')}>
            {(f) => <Textarea {...f} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />}
          </FormField>
        )}

        {to === 'CANCELLED' && order.paidTotal > 0 && <Callout tone="warning">{t('transition.refundNote', { amount: money(order.paidTotal) })}</Callout>}
      </div>
    </FormDialog>
  );
}
