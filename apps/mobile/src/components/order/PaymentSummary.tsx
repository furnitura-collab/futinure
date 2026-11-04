import { View } from 'react-native';
import { formatDate } from '@mebel/shared';
import { Badge, Card, Divider, Row, Text } from '@/components/ui';
import { useI18n, type I18nKey } from '@/i18n';
import { PAYMENT_TONE } from '@/lib/catalog';
import type { OrderDetail } from '@/lib/types';
import { space } from '@/theme';
import { SumRow } from './SumRow';

const TERMS_HINT: Record<NonNullable<OrderDetail['paymentTerms']>, I18nKey> = {
  PREPAID: 'termsHintPREPAID',
  ADVANCE: 'termsHintADVANCE',
  ON_DELIVERY: 'termsHintON_DELIVERY',
  CREDIT: 'termsHintCREDIT',
};

/** To'lov: jami, to'langan, qolgan — oddiy so'zlar bilan; shart va yuborilgan cheklar */
export function PaymentSummary({ o }: { o: OrderDetail }) {
  const { t, money, terms, method, paymentStatus } = useI18n();
  const open = o.status !== 'CANCELLED';
  return (
    <Card style={{ gap: space(2) }}>
      <Text v="h2">{t('paymentTitle')}</Text>
      <SumRow label={t('itemsSum')} value={money(o.itemsTotal)} />
      {o.deliveryFee > 0 && <SumRow label={t('deliveryFee')} value={money(o.deliveryFee)} />}
      {o.discountTotal > 0 && <SumRow label={t('discount')} value={`−${money(o.discountTotal)}`} tone="success" />}
      <SumRow label={t('total')} value={money(o.grandTotal)} bold />
      {o.paidTotal > 0 && <SumRow label={t('paid')} value={money(o.paidTotal)} tone="success" />}
      {open && o.balanceDue > 0 && <SumRow label={t('leftToPay')} value={money(o.balanceDue)} tone="warning" />}

      {o.paymentTerms && (
        <View style={{ gap: 2, marginTop: space(1) }}>
          <Text v="small" bold>
            {t('terms')}: {terms(o.paymentTerms)}
            {o.paymentTerms === 'ADVANCE' ? ` — ${money(o.advanceAmount)}` : ''}
          </Text>
          <Text v="caption">{t(TERMS_HINT[o.paymentTerms], { date: o.dueDate ? formatDate(o.dueDate) : '—' })}</Text>
          {o.allowedMethods.length > 0 && <Text v="caption">{t('methodsList', { list: o.allowedMethods.map(method).join(', ') })}</Text>}
        </View>
      )}

      {o.payments.length > 0 && (
        <>
          <Divider />
          <Text v="small" bold>{t('sentPayments')}</Text>
          {o.payments.map((p) => (
            <Row key={p.id} between style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text v="small">
                  {money(p.amount)} · {method(p.method)}
                </Text>
                <Text v="caption">{formatDate(p.createdAt)}</Text>
                {p.rejectReason ? <Text v="caption" tone="destructive">{p.rejectReason}</Text> : null}
              </View>
              <Badge label={paymentStatus(p.status)} tone={PAYMENT_TONE[p.status]} dot />
            </Row>
          ))}
        </>
      )}
    </Card>
  );
}
