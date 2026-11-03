import type { Locale, OrderStatus } from '@mebel/shared';

/** 4620000 → "4 620 000 so'm" */
export function formatSom(amount: number | bigint, locale: Locale = 'uz') {
  const n = Number(amount)
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return locale === 'ru' ? `${n} сум` : `${n} so'm`;
}

type Text = Record<Locale, string>;

/** Mijozga bildirishnoma beriladigan statuslar */
export const STATUS_TEXT: Partial<Record<OrderStatus, { title: Text; body: Text }>> = {
  CONFIRMED: {
    title: { uz: 'Buyurtma tasdiqlandi', ru: 'Заказ подтверждён' },
    body: { uz: '{number} tasdiqlandi. Jami: {total}', ru: '{number} подтверждён. Итого: {total}' },
  },
  PREPARING: {
    title: { uz: 'Buyurtma tayyorlanmoqda', ru: 'Заказ собирается' },
    body: { uz: '{number} omborda yig\'ilmoqda', ru: '{number} собирается на складе' },
  },
  READY: {
    title: { uz: 'Buyurtma tayyor', ru: 'Заказ готов' },
    body: { uz: '{number} tayyor', ru: '{number} готов' },
  },
  OUT_FOR_DELIVERY: {
    title: { uz: 'Buyurtma yo\'lda', ru: 'Заказ в пути' },
    body: { uz: '{number} sizga yetkazilmoqda', ru: '{number} доставляется' },
  },
  DELIVERED: {
    title: { uz: 'Buyurtma topshirildi', ru: 'Заказ передан' },
    body: { uz: '{number} topshirildi. Rahmat!', ru: '{number} передан. Спасибо!' },
  },
  CANCELLED: {
    title: { uz: 'Buyurtma bekor qilindi', ru: 'Заказ отменён' },
    body: { uz: '{number}: {comment}', ru: '{number}: {comment}' },
  },
  NEW: {
    title: { uz: 'Taklif muddati o\'tdi', ru: 'Срок предложения истёк' },
    body: { uz: '{number}: menejer yangi taklif yuboradi', ru: '{number}: менеджер отправит новое предложение' },
  },
};

export const READY_FOR_PICKUP: { title: Text; body: Text } = {
  title: { uz: 'Olib ketishga tayyor', ru: 'Готов к выдаче' },
  body: { uz: '{number} omborda sizni kutmoqda', ru: '{number} ждёт вас на складе' },
};

export const DELIVERY_FAILED: { title: Text; body: Text } = {
  title: { uz: 'Yetkazib bo\'lmadi', ru: 'Доставка не состоялась' },
  body: { uz: '{number}: {comment}. Menejer siz bilan bog\'lanadi', ru: '{number}: {comment}. Менеджер свяжется с вами' },
};

export const TEXTS = {
  quote: {
    title: { uz: 'Yangi taklif', ru: 'Новое предложение' },
    body: { uz: '{number}: jami {total}. Ko\'rib chiqing va tasdiqlang', ru: '{number}: итого {total}. Посмотрите и подтвердите' },
  },
  paymentConfirmed: {
    title: { uz: 'To\'lov qabul qilindi', ru: 'Оплата принята' },
    body: { uz: '{amount} qabul qilindi{order}', ru: 'Получено {amount}{order}' },
  },
  paymentRejected: {
    title: { uz: 'To\'lov rad etildi', ru: 'Оплата отклонена' },
    body: { uz: '{amount}: {reason}', ru: '{amount}: {reason}' },
  },
  chat: {
    title: { uz: 'Menejerdan xabar', ru: 'Сообщение от менеджера' },
    body: { uz: '{number}: {text}', ru: '{number}: {text}' },
  },
  deliveryAssigned: {
    title: { uz: 'Yangi yetkazish', ru: 'Новая доставка' },
    body: { uz: '{number}: {address}', ru: '{number}: {address}' },
  },
  debtSoon: {
    title: { uz: 'To\'lov muddati yaqin', ru: 'Скоро срок оплаты' },
    body: { uz: '{number}: {due} gacha {amount} to\'lash kerak', ru: '{number}: до {due} нужно оплатить {amount}' },
  },
  debtOverdue: {
    title: { uz: 'To\'lov muddati o\'tgan', ru: 'Просрочена оплата' },
    body: { uz: '{number}: {amount} qarz, muddat {due} edi', ru: '{number}: долг {amount}, срок был {due}' },
  },
} satisfies Record<string, { title: Text; body: Text }>;

export function render(t: { title: Text; body: Text }, locale: Locale, params: Record<string, string>) {
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '');
  return { title: fill(t.title[locale]), body: fill(t.body[locale]) };
}
