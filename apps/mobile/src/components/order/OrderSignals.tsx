import { View } from 'react-native';
import { Badge, Icon, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { OrderListItem } from '@/lib/types';

/** "Nima buyurtma qilingan" — bir qatorda: birinchi tovarlar va qolganlari soni */
export function useItemsLine(o: OrderListItem) {
  const { t, name } = useI18n();
  const more = o.itemsCount - o.preview.length;
  return o.preview.map((i) => name(i)).join(', ') + (more > 0 ? ` ${t('moreItems', { n: more })}` : '');
}

/** Mijozdan kutilayotgan harakat: to'lov summasi va o'qilmagan xabarlar soni */
export function OrderSignals({ o }: { o: OrderListItem }) {
  const { t, money } = useI18n();
  if (o.amountDue <= 0 && !o.unreadMessages) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      {/* Summa faqat jamidan farq qilsa (avans, qoldiq) — aks holda qatordagi jami summani takrorlardi */}
      {o.amountDue > 0 && (
        <Badge tone="warning" label={o.amountDue === o.grandTotal ? t('pillPayFull') : t('pillPay', { amount: money(o.amountDue) })} />
      )}
      {o.unreadMessages > 0 && (
        <View accessibilityLabel={t('actMessageTitle', { n: o.unreadMessages })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="chat-circle" size={16} weight="fill" tone="info" />
          <Text v="small" bold tone="info">{o.unreadMessages}</Text>
        </View>
      )}
    </View>
  );
}
