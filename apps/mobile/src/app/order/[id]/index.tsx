import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import type { QuoteLineAction } from '@mebel/shared';
import { Badge, Button, Card, Divider, ErrorView, Input, Ionicons, Loader, Row, Text } from '../../../components/ui';
import { api } from '../../../lib/api';
import { attrsText, STATUS_TONE } from '../../../lib/catalog';
import { date, dateTime, som } from '../../../lib/format';
import { useI18n } from '../../../lib/i18n';
import { useApiMutation } from '../../../lib/mutation';
import { useOrderRoom } from '../../../lib/realtime';
import { colors, radius, space } from '../../../lib/theme';
import type { OrderDetail, Quote } from '../../../lib/types';
import { contained, CONTENT } from '../../../lib/layout';

const PAYABLE = ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'];

export default function Order() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, status, locale, name, unit, terms, method } = useI18n();
  useOrderRoom(id);
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api<OrderDetail>(`/orders/${id}`) });
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');

  const cancel = useApiMutation(() => api(`/orders/${id}/cancel`, { body: { reason: reason.trim() } }), {
    invalidate: [['order', id], ['orders']],
    onSuccess: () => setCancelling(false),
  });
  const reorder = useApiMutation(() => api(`/cart/reorder/${id}`, { method: 'POST' }), {
    invalidate: [['cart']],
    onSuccess: () => router.navigate('/cart'),
  });

  if (q.isPending) return <Loader />;
  if (q.error) return <ErrorView error={q.error} onRetry={() => void q.refetch()} />;
  const o = q.data;
  const canPay = PAYABLE.includes(o.status) && o.balanceDue > 0;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: o.number }} />
      <ScrollView
        contentContainerStyle={{ ...contained(CONTENT.page), padding: space(4), gap: space(4) }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <Badge label={status(o.status)} tone={STATUS_TONE[o.status]} />
          <Text v="caption">{dateTime(o.createdAt)}</Text>
        </Row>

        {o.pendingQuote && <QuoteCard orderId={o.id} quote={o.pendingQuote} />}

        <Card style={{ gap: space(2) }}>
          <Text v="h2">{t('items')}</Text>
          {o.items.map((i) => (
            <View key={i.id} style={{ gap: 2, paddingVertical: space(1) }}>
              <Text bold>{name(i)}</Text>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text v="caption">
                  {[i.sku, attrsText(i.attributes)].filter(Boolean).join(' · ')}
                </Text>
                <Text v="small">
                  {i.qty} {unit(i.unit)} × {som(i.unitPrice, locale)}
                </Text>
              </Row>
              {i.requestedQty !== i.qty && (
                <Text v="caption" color={colors.warning}>{t('changed')}: {i.requestedQty} → {i.qty}</Text>
              )}
            </View>
          ))}
          <Divider />
          <Sum label={t('items')} value={som(o.itemsTotal, locale)} />
          {o.deliveryFee > 0 && <Sum label={t('deliveryFee')} value={som(o.deliveryFee, locale)} />}
          {o.discountTotal > 0 && <Sum label={t('discount')} value={`−${som(o.discountTotal, locale)}`} />}
          <Sum label={t('total')} value={som(o.grandTotal, locale)} bold />
          {o.paidTotal > 0 && <Sum label={t('paid')} value={som(o.paidTotal, locale)} color={colors.success} />}
          {o.balanceDue > 0 && o.status !== 'CANCELLED' && <Sum label={t('due')} value={som(o.balanceDue, locale)} color={colors.warning} />}
        </Card>

        {o.paymentTerms && (
          <Card style={{ gap: 4 }}>
            <Text v="small" muted>{t('terms')}</Text>
            <Text bold>
              {terms(o.paymentTerms)}
              {o.paymentTerms === 'ADVANCE' ? `: ${som(o.advanceAmount, locale)}` : ''}
            </Text>
            <Text v="small">{o.allowedMethods.map(method).join(', ')}</Text>
            {o.dueDate && <Text v="small" color={colors.warning}>{date(o.dueDate)}</Text>}
          </Card>
        )}

        <Card style={{ gap: 4 }}>
          <Text v="small" muted>{o.deliveryType === 'PICKUP' ? t('pickup') : t('delivery')}</Text>
          <Text bold>{o.pickupWarehouse?.name ?? o.addressSnapshot?.addressText}</Text>
          {o.pickupWarehouse && <Text v="small">{[o.pickupWarehouse.addressText, o.pickupWarehouse.workHours].filter(Boolean).join(' · ')}</Text>}
          {o.deliveryDate && <Text v="small">{date(o.deliveryDate)}</Text>}
          {o.customerComment ? <Text v="small" muted>💬 {o.customerComment}</Text> : null}
          {o.cancelReason ? <Text v="small" color={colors.danger}>{o.cancelReason}</Text> : null}
        </Card>

        {o.payments.length > 0 && (
          <Card style={{ gap: space(2) }}>
            <Text v="h2">{t('payments')}</Text>
            {o.payments.map((p) => (
              <View key={p.id}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text>{som(p.amount, locale)} · {method(p.method)}</Text>
                  <Badge
                    label={p.status === 'PENDING' ? '⏳' : p.status === 'CONFIRMED' ? '✓' : '✕'}
                    tone={p.status === 'PENDING' ? 'warning' : p.status === 'CONFIRMED' ? 'success' : 'danger'}
                  />
                </Row>
                {p.rejectReason && <Text v="caption" color={colors.danger}>{p.rejectReason}</Text>}
              </View>
            ))}
          </Card>
        )}

        <Card style={{ gap: space(2) }}>
          <Text v="h2">{t('statusHistory')}</Text>
          {o.statusHistory.map((h, i) => (
            <Row key={i} style={{ alignItems: 'flex-start' }}>
              <Ionicons name="ellipse" size={10} color={colors.brand} style={{ marginTop: 5 }} />
              <View style={{ flex: 1 }}>
                <Text v="small" bold>{status(h.toStatus)}</Text>
                <Text v="caption">{dateTime(h.createdAt)}</Text>
                {h.comment ? <Text v="caption">{h.comment}</Text> : null}
              </View>
            </Row>
          ))}
        </Card>

        {cancelling ? (
          <Card style={{ gap: space(3) }}>
            <Input label={t('cancelReason')} value={reason} onChangeText={setReason} autoFocus />
            <Row>
              <Button title={t('back')} variant="secondary" onPress={() => setCancelling(false)} style={{ flex: 1 }} />
              <Button title={t('cancelOrder')} variant="danger" disabled={reason.trim().length < 3} loading={cancel.isPending} onPress={() => cancel.mutate(undefined)} style={{ flex: 1 }} />
            </Row>
          </Card>
        ) : (
          <View style={{ gap: space(2) }}>
            {['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(o.status) && (
              <Button title={t('reorder')} icon="repeat" variant="secondary" loading={reorder.isPending} onPress={() => reorder.mutate(undefined)} />
            )}
            {o.canCancel && <Button title={t('cancelOrder')} variant="ghost" onPress={() => setCancelling(true)} />}
          </View>
        )}
      </ScrollView>

      <View style={{ padding: space(4), borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
        <View style={{ ...contained(CONTENT.page), flexDirection: 'row', gap: space(3) }}>
          <Button title={t('chat')} icon="chatbubbles-outline" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/order/[id]/chat', params: { id: o.id } })} />
          {canPay && (
            <Button title={t('pay')} icon="card-outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/pay', params: { orderId: o.id } })} />
          )}
        </View>
      </View>
    </View>
  );
}

function Sum({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text muted={!bold} bold={bold}>{label}</Text>
      <Text bold={bold} color={color}>{value}</Text>
    </Row>
  );
}

const ACTION_TONE: Record<QuoteLineAction, string> = {
  KEEP: colors.text,
  CHANGE: colors.warning,
  REMOVE: colors.danger,
  REPLACE: colors.violet,
  ADD: colors.success,
};

function QuoteCard({ orderId, quote: q }: { orderId: string; quote: Quote }) {
  const { t, locale, name, unit, terms, method } = useI18n();
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');
  const label: Record<QuoteLineAction, string> = { KEEP: '', CHANGE: t('changed'), REMOVE: t('removed'), REPLACE: t('replaced'), ADD: t('added') };

  const accept = useApiMutation(() => api(`/orders/${orderId}/quotes/${q.id}/accept`, { method: 'POST' }), {
    invalidate: [['order', orderId], ['orders']],
  });
  const reject = useApiMutation(() => api(`/orders/${orderId}/quotes/${q.id}/reject`, { body: { comment: comment.trim() } }), {
    invalidate: [['order', orderId], ['orders']],
  });

  return (
    <View style={{ borderRadius: radius.lg, borderWidth: 2, borderColor: colors.violet, backgroundColor: colors.violetSoft, padding: space(4), gap: space(3) }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text v="h2" color={colors.violet}>{t('quoteTitle')}</Text>
        <Text v="caption">{t('quoteValidUntil', { time: dateTime(q.expiresAt) })}</Text>
      </Row>
      {q.managerNote && <Text>💬 {q.managerNote}</Text>}

      <View style={{ gap: space(2) }}>
        {q.lines.map((l, i) => (
          <View key={i} style={{ backgroundColor: colors.card, borderRadius: radius.sm, padding: space(3), gap: 2, opacity: l.action === 'REMOVE' ? 0.7 : 1 }}>
            {l.action !== 'KEEP' && <Text v="caption" bold color={ACTION_TONE[l.action]}>{label[l.action].toUpperCase()}</Text>}
            {l.replaces && <Text v="small" muted style={{ textDecorationLine: 'line-through' }}>{name(l.replaces)}</Text>}
            <Text bold style={l.action === 'REMOVE' ? { textDecorationLine: 'line-through' } : undefined}>{name(l)}</Text>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text v="small">
                {l.oldQty && l.oldQty !== l.qty ? `${l.oldQty} → ` : ''}
                {l.qty} {unit(l.unit as never)} × {som(l.unitPrice, locale)}
              </Text>
              <Text v="small" bold>{som(l.lineTotal, locale)}</Text>
            </Row>
          </View>
        ))}
      </View>

      <View style={{ gap: 4 }}>
        {q.totals.deliveryFee > 0 && <Sum label={t('deliveryFee')} value={som(q.totals.deliveryFee, locale)} />}
        {q.totals.discountTotal > 0 && <Sum label={t('discount')} value={`−${som(q.totals.discountTotal, locale)}`} />}
        <Sum label={t('total')} value={som(q.totals.grandTotal, locale)} bold />
        <Sum label={t('terms')} value={`${terms(q.paymentTerms)}${q.paymentTerms === 'ADVANCE' ? ` ${som(q.advanceAmount, locale)}` : ''}`} />
        <Text v="caption">{t('methods')}: {q.allowedMethods.map(method).join(', ')}</Text>
        {q.terms.deliveryDate ? <Text v="caption">📅 {date(q.terms.deliveryDate)}</Text> : null}
      </View>

      {rejecting ? (
        <View style={{ gap: space(2) }}>
          <Input label={t('rejectReason')} value={comment} onChangeText={setComment} autoFocus multiline />
          <Row>
            <Button title={t('back')} variant="secondary" style={{ flex: 1 }} onPress={() => setRejecting(false)} />
            <Button title={t('send')} variant="danger" style={{ flex: 1 }} disabled={comment.trim().length < 3} loading={reject.isPending} onPress={() => reject.mutate(undefined)} />
          </Row>
        </View>
      ) : (
        <Row>
          <Button title={t('reject')} variant="secondary" style={{ flex: 1 }} onPress={() => setRejecting(true)} />
          <Button title={t('accept')} icon="checkmark" style={{ flex: 1 }} loading={accept.isPending} onPress={() => accept.mutate(undefined)} />
        </Row>
      )}
    </View>
  );
}
