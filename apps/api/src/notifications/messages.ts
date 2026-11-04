import type { Locale, OrderStatus } from '@mebel/shared';

type Text = Record<Locale, string>;
export type Template = { title: Text; body: Text };

/** Mijozga bildirishnoma beriladigan statuslar */
export const STATUS_TEXT: Partial<Record<OrderStatus, Template>> = {
  CONFIRMED: {
    title: { uz: 'Buyurtma tasdiqlandi', ru: 'Заказ подтверждён', en: 'Order confirmed' },
    body: { uz: '{number} tasdiqlandi. Jami: {total}', ru: '{number} подтверждён. Итого: {total}', en: '{number} is confirmed. Total: {total}' },
  },
  PREPARING: {
    title: { uz: 'Buyurtma tayyorlanmoqda', ru: 'Заказ собирается', en: 'Order is being prepared' },
    body: { uz: '{number} omborda yig\'ilmoqda', ru: '{number} собирается на складе', en: '{number} is being packed at the warehouse' },
  },
  READY: {
    title: { uz: 'Buyurtma tayyor', ru: 'Заказ готов', en: 'Order is ready' },
    body: { uz: '{number} tayyor', ru: '{number} готов', en: '{number} is ready' },
  },
  OUT_FOR_DELIVERY: {
    title: { uz: 'Buyurtma yo\'lda', ru: 'Заказ в пути', en: 'Order is on its way' },
    body: { uz: '{number} sizga yetkazilmoqda', ru: '{number} доставляется', en: '{number} is out for delivery' },
  },
  DELIVERED: {
    title: { uz: 'Buyurtma topshirildi', ru: 'Заказ передан', en: 'Order delivered' },
    body: { uz: '{number} topshirildi. Rahmat!', ru: '{number} передан. Спасибо!', en: '{number} has been delivered. Thank you!' },
  },
  CANCELLED: {
    title: { uz: 'Buyurtma bekor qilindi', ru: 'Заказ отменён', en: 'Order cancelled' },
    body: { uz: '{number}: {comment}', ru: '{number}: {comment}', en: '{number}: {comment}' },
  },
  NEW: {
    title: { uz: 'Taklif muddati o\'tdi', ru: 'Срок предложения истёк', en: 'Quote expired' },
    body: {
      uz: '{number}: menejer yangi taklif yuboradi',
      ru: '{number}: менеджер отправит новое предложение',
      en: '{number}: your manager will send a new quote',
    },
  },
};

export const READY_FOR_PICKUP: Template = {
  title: { uz: 'Olib ketishga tayyor', ru: 'Готов к выдаче', en: 'Ready for pickup' },
  body: { uz: '{number} omborda sizni kutmoqda', ru: '{number} ждёт вас на складе', en: '{number} is waiting for you at the warehouse' },
};

export const DELIVERY_FAILED: Template = {
  title: { uz: 'Yetkazib bo\'lmadi', ru: 'Доставка не состоялась', en: 'Delivery failed' },
  body: {
    uz: '{number}: {comment}. Menejer siz bilan bog\'lanadi',
    ru: '{number}: {comment}. Менеджер свяжется с вами',
    en: '{number}: {comment}. Your manager will contact you',
  },
};

export const TEXTS = {
  quote: {
    title: { uz: 'Yangi taklif', ru: 'Новое предложение', en: 'New quote' },
    body: {
      uz: '{number}: jami {total}. Ko\'rib chiqing va tasdiqlang',
      ru: '{number}: итого {total}. Посмотрите и подтвердите',
      en: '{number}: total {total}. Please review and confirm',
    },
  },
  paymentConfirmed: {
    title: { uz: 'To\'lov qabul qilindi', ru: 'Оплата принята', en: 'Payment received' },
    body: { uz: '{amount} qabul qilindi{order}', ru: 'Получено {amount}{order}', en: '{amount} received{order}' },
  },
  paymentRejected: {
    title: { uz: 'To\'lov rad etildi', ru: 'Оплата отклонена', en: 'Payment rejected' },
    body: { uz: '{amount}: {reason}', ru: '{amount}: {reason}', en: '{amount}: {reason}' },
  },
  chat: {
    title: { uz: 'Menejerdan xabar', ru: 'Сообщение от менеджера', en: 'Message from your manager' },
    body: { uz: '{number}: {text}', ru: '{number}: {text}', en: '{number}: {text}' },
  },
  deliveryAssigned: {
    title: { uz: 'Yangi yetkazish', ru: 'Новая доставка', en: 'New delivery' },
    body: { uz: '{number}: {address}', ru: '{number}: {address}', en: '{number}: {address}' },
  },
  debtSoon: {
    title: { uz: 'To\'lov muddati yaqin', ru: 'Скоро срок оплаты', en: 'Payment due soon' },
    body: {
      uz: '{number}: {due} gacha {amount} to\'lash kerak',
      ru: '{number}: до {due} нужно оплатить {amount}',
      en: '{number}: {amount} is due by {due}',
    },
  },
  debtOverdue: {
    title: { uz: 'To\'lov muddati o\'tgan', ru: 'Просрочена оплата', en: 'Payment overdue' },
    body: {
      uz: '{number}: {amount} qarz, muddat {due} edi',
      ru: '{number}: долг {amount}, срок был {due}',
      en: '{number}: {amount} outstanding, was due {due}',
    },
  },
} satisfies Record<string, Template>;

export function render(t: Template, locale: Locale, params: Record<string, string>) {
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '');
  return { title: fill(t.title[locale]), body: fill(t.body[locale]) };
}
