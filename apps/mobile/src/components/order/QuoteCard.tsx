import { useState } from 'react';
import { View } from 'react-native';
import { formatDate, formatDateTime, type QuoteLineAction } from '@mebel/shared';
import { Badge, Button, Card, Icon, Input, Row, Text } from '@/components/ui';
import { useI18n, type I18nKey } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import type { Quote } from '@/lib/types';
import { radius, space, useTheme, type Tone } from '@/theme';
import { SumRow } from './SumRow';

const ACTION: Record<Exclude<QuoteLineAction, 'KEEP'>, { tone: Tone; key: I18nKey }> = {
  CHANGE: { tone: 'warning', key: 'changed' },
  REMOVE: { tone: 'destructive', key: 'removed' },
  REPLACE: { tone: 'violet', key: 'replaced' },
  ADD: { tone: 'success', key: 'added' },
};

/** Menejer taklifi: o'zgargan qatorlar, yangi jami va shartlar — qabul yoki rad */
export function QuoteCard({ orderId, quote: q }: { orderId: string; quote: Quote }) {
  const { t, money, name, unit, terms, method } = useI18n();
  const { colors } = useTheme();
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');
  const invalidate = [['order', orderId], ['orders']];

  const accept = useApiMutation(() => api(`/orders/${orderId}/quotes/${q.id}/accept`, { method: 'POST' }), { invalidate });
  const reject = useApiMutation(() => api(`/orders/${orderId}/quotes/${q.id}/reject`, { body: { comment: comment.trim() } }), { invalidate });

  return (
    <Card tone="violet" style={{ gap: space(4), borderWidth: 1, borderColor: colors.violet }}>
      <View style={{ gap: space(1) }}>
        <Row gap={6}>
          <Icon name="sparkles" size={18} tone="violet" />
          <Text v="h2" tone="violet">{t('quoteTitle')}</Text>
        </Row>
        <Text v="caption">{t('quoteValidUntil', { time: formatDateTime(q.expiresAt) })}</Text>
      </View>
      {q.managerNote && (
        <Row style={{ alignItems: 'flex-start' }}>
          <Icon name="chatbubble-ellipses-outline" size={16} muted />
          <Text style={{ flex: 1 }}>{q.managerNote}</Text>
        </Row>
      )}

      <View style={{ gap: space(2) }}>
        {q.lines.map((l, i) => {
          const removed = l.action === 'REMOVE';
          return (
            <View key={i} style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: space(3), gap: 4, opacity: removed ? 0.7 : 1 }}>
              {l.action !== 'KEEP' && <Badge label={t(ACTION[l.action].key)} tone={ACTION[l.action].tone} />}
              {l.replaces && <Text v="small" muted style={{ textDecorationLine: 'line-through' }}>{name(l.replaces)}</Text>}
              <Text bold style={removed ? { textDecorationLine: 'line-through' } : undefined}>{name(l)}</Text>
              <Row between>
                <Text v="small" muted>
                  {l.oldQty && l.oldQty !== l.qty ? `${l.oldQty} → ` : ''}
                  {l.qty} {unit(l.unit)} × {money(l.unitPrice)}
                </Text>
                <Text v="small" bold>{money(l.lineTotal)}</Text>
              </Row>
            </View>
          );
        })}
      </View>

      <View style={{ gap: space(1) }}>
        {q.totals.deliveryFee > 0 && <SumRow label={t('deliveryFee')} value={money(q.totals.deliveryFee)} />}
        {q.totals.discountTotal > 0 && <SumRow label={t('discount')} value={`−${money(q.totals.discountTotal)}`} tone="success" />}
        <SumRow label={t('total')} value={money(q.totals.grandTotal)} bold />
        <SumRow label={t('terms')} value={`${terms(q.paymentTerms)}${q.paymentTerms === 'ADVANCE' ? ` ${money(q.advanceAmount)}` : ''}`} />
        <Text v="caption">
          {t('methods')}: {q.allowedMethods.map(method).join(', ')}
        </Text>
        {q.terms.deliveryDate ? (
          <Text v="caption">
            {t('deliveryDate')}: {formatDate(q.terms.deliveryDate)}
          </Text>
        ) : null}
      </View>

      {rejecting ? (
        <View style={{ gap: space(3) }}>
          <Input label={t('rejectReason')} value={comment} onChangeText={setComment} autoFocus multiline />
          <Row>
            <Button title={t('back')} variant="outline" style={{ flex: 1 }} onPress={() => setRejecting(false)} />
            <Button title={t('send')} variant="destructive" style={{ flex: 1 }} disabled={comment.trim().length < 3} loading={reject.isPending} onPress={() => reject.mutate(undefined)} />
          </Row>
        </View>
      ) : (
        <Row>
          <Button title={t('reject')} variant="outline" style={{ flex: 1 }} onPress={() => setRejecting(true)} />
          <Button title={t('accept')} icon="checkmark" style={{ flex: 1 }} loading={accept.isPending} onPress={() => accept.mutate(undefined)} />
        </Row>
      )}
    </Card>
  );
}
