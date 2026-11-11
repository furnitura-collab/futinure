import type { StockLevel } from './availability.js';
import type {
  CustomerType,
  DeliveryStatus,
  DeliveryType,
  Locale,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTerms,
  Role,
  Unit,
} from './enums.js';

type Labels<K extends string> = Record<Locale, Record<K, string>>;

/** Enum qiymatlarining tarjimalari — admin panel, mobil ilova va bildirishnomalar uchun yagona manba */
export const LABELS = {
  orderStatus: {
    uz: {
      NEW: 'Yangi',
      PREPARING: "Yig'ilmoqda",
      READY: 'Tayyor',
      OUT_FOR_DELIVERY: "Yo'lda",
      DELIVERED: 'Topshirildi',
      COMPLETED: 'Yakunlandi',
      CANCELLED: 'Bekor qilindi',
    },
    ru: {
      NEW: 'Новый',
      PREPARING: 'Собирается',
      READY: 'Готов',
      OUT_FOR_DELIVERY: 'В пути',
      DELIVERED: 'Передан',
      COMPLETED: 'Завершён',
      CANCELLED: 'Отменён',
    },
    en: {
      NEW: 'New',
      PREPARING: 'Preparing',
      READY: 'Ready',
      OUT_FOR_DELIVERY: 'Out for delivery',
      DELIVERED: 'Delivered',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
    },
  } satisfies Labels<OrderStatus>,

  unit: {
    uz: { PIECE: 'dona', SHEET: 'list', METER: 'm', SQM: 'm²', KG: 'kg', SET: 'kompl.', PACK: 'pachka' },
    ru: { PIECE: 'шт', SHEET: 'лист', METER: 'м', SQM: 'м²', KG: 'кг', SET: 'компл.', PACK: 'уп.' },
    en: { PIECE: 'pcs', SHEET: 'sheet', METER: 'm', SQM: 'm²', KG: 'kg', SET: 'set', PACK: 'pack' },
  } satisfies Labels<Unit>,

  paymentTerms: {
    uz: { PREPAID: "To'liq oldindan", ADVANCE: 'Avans', ON_DELIVERY: 'Topshirishda', CREDIT: 'Nasiya' },
    ru: { PREPAID: 'Полная предоплата', ADVANCE: 'Аванс', ON_DELIVERY: 'При получении', CREDIT: 'В рассрочку' },
    en: { PREPAID: 'Prepaid', ADVANCE: 'Advance', ON_DELIVERY: 'On delivery', CREDIT: 'Credit' },
  } satisfies Labels<PaymentTerms>,

  paymentMethod: {
    uz: { CASH: 'Naqd', CARD_TRANSFER: "Kartaga o'tkazma", CLICK: 'Click', PAYME: 'Payme', BANK_TRANSFER: "Bank o'tkazma" },
    ru: { CASH: 'Наличные', CARD_TRANSFER: 'Перевод на карту', CLICK: 'Click', PAYME: 'Payme', BANK_TRANSFER: 'Банковский перевод' },
    en: { CASH: 'Cash', CARD_TRANSFER: 'Card transfer', CLICK: 'Click', PAYME: 'Payme', BANK_TRANSFER: 'Bank transfer' },
  } satisfies Labels<PaymentMethod>,

  paymentStatus: {
    uz: { PENDING: 'Tekshirilmoqda', CONFIRMED: 'Tasdiqlangan', REJECTED: 'Rad etilgan' },
    ru: { PENDING: 'На проверке', CONFIRMED: 'Подтверждён', REJECTED: 'Отклонён' },
    en: { PENDING: 'Under review', CONFIRMED: 'Confirmed', REJECTED: 'Rejected' },
  } satisfies Labels<PaymentStatus>,


  stockLevel: {
    uz: { IN_STOCK: 'Bor', LOW: 'Kam qoldi', ON_ORDER: 'Buyurtmaga', OUT_OF_STOCK: 'Tugagan' },
    ru: { IN_STOCK: 'В наличии', LOW: 'Мало', ON_ORDER: 'Под заказ', OUT_OF_STOCK: 'Нет в наличии' },
    en: { IN_STOCK: 'In stock', LOW: 'Low stock', ON_ORDER: 'On order', OUT_OF_STOCK: 'Out of stock' },
  } satisfies Labels<StockLevel>,

  deliveryType: {
    uz: { DELIVERY: 'Yetkazish', PICKUP: 'Olib ketish' },
    ru: { DELIVERY: 'Доставка', PICKUP: 'Самовывоз' },
    en: { DELIVERY: 'Delivery', PICKUP: 'Pickup' },
  } satisfies Labels<DeliveryType>,

  deliveryStatus: {
    uz: { ASSIGNED: 'Biriktirilgan', IN_TRANSIT: "Yo'lda", DELIVERED: 'Topshirildi', FAILED: 'Yetkazilmadi' },
    ru: { ASSIGNED: 'Назначено', IN_TRANSIT: 'В пути', DELIVERED: 'Доставлено', FAILED: 'Не доставлено' },
    en: { ASSIGNED: 'Assigned', IN_TRANSIT: 'In transit', DELIVERED: 'Delivered', FAILED: 'Failed' },
  } satisfies Labels<DeliveryStatus>,

  role: {
    uz: { CUSTOMER: 'Mijoz', MANAGER: 'Menejer', SUPER_ADMIN: 'Super admin', WAREHOUSE: 'Omborchi', DRIVER: 'Haydovchi' },
    ru: { CUSTOMER: 'Клиент', MANAGER: 'Менеджер', SUPER_ADMIN: 'Супер-админ', WAREHOUSE: 'Кладовщик', DRIVER: 'Водитель' },
    en: { CUSTOMER: 'Customer', MANAGER: 'Manager', SUPER_ADMIN: 'Super admin', WAREHOUSE: 'Warehouse', DRIVER: 'Driver' },
  } satisfies Labels<Role>,

  customerType: {
    uz: { MASTER: 'Usta', COMPANY: 'Firma / sex', INDIVIDUAL: 'Shaxsiy' },
    ru: { MASTER: 'Мастер', COMPANY: 'Фирма / цех', INDIVIDUAL: 'Частное лицо' },
    en: { MASTER: 'Craftsman', COMPANY: 'Company / workshop', INDIVIDUAL: 'Individual' },
  } satisfies Labels<CustomerType>,
} as const;

export type LabelGroup = keyof typeof LABELS;

export function label<G extends LabelGroup>(group: G, value: keyof (typeof LABELS)[G]['uz'], locale: Locale): string {
  return (LABELS[group][locale] as Record<string, string>)[value as string] ?? String(value);
}

/** API xato kodlari → foydalanuvchiga ko'rinadigan matn */
export const API_ERRORS: Record<Locale, Record<string, string>> = {
  uz: {
    NETWORK: "Internet aloqasi yo'q",
    CART_EMPTY: "Savat bo'sh",
    CART_HAS_ISSUES: "Savatdagi ba'zi tovarlarni tuzating",
    OUT_OF_STOCK: 'Tovar tugagan',
    INACTIVE: 'Bu tovar endi sotilmaydi',
    BELOW_MIN: 'Eng kam buyurtma miqdoridan oz',
    NOT_MULTIPLE_OF_STEP: 'Miqdor sotuv qadamiga mos emas',
    INVALID_QTY: "Miqdor noto'g'ri",
    INVALID_PASSWORD: "Parol noto'g'ri",
    LOGIN_RATE_LIMIT: "Juda ko'p urinish, birozdan keyin qayta urining",
    PASSWORD_NOT_SET: "Parol o'rnatilmagan — administratorga murojaat qiling",
    PHONE_TAKEN: "Bu raqam allaqachon ro'yxatdan o'tgan",
    CANNOT_MODIFY_SELF: "O'z hisobingizni o'chira yoki rolini tushira olmaysiz",
    INSUFFICIENT_STOCK: "Omborda yetarli tovar yo'q",
    AMOUNT_EXCEEDS_DUE: 'Summa qoldiqdan katta',
    METHOD_NOT_ALLOWED: "Bu to'lov usuli kelishilmagan",
    TOO_MANY_PENDING: 'Avvalgi cheklar hali tekshirilmoqda',
    ADVANCE_NOT_PAID: "Avans hali to'lanmagan",
    CREDIT_LIMIT_EXCEEDED: 'Kredit limitidan oshadi',
    TRANSITION_NO_SUCH_TRANSITION: "Buyurtma holati o'zgargan — sahifani yangilang",
    ORDER_CONFLICT: "Buyurtmani boshqa foydalanuvchi o'zgartirgan — sahifa yangilandi",
    STOCK_NOT_RECEIVED: 'Tovar hali omborga kirim qilinmagan',
  },
  ru: {
    NETWORK: 'Нет подключения к интернету',
    CART_EMPTY: 'Корзина пуста',
    CART_HAS_ISSUES: 'Исправьте некоторые товары в корзине',
    OUT_OF_STOCK: 'Товар закончился',
    INACTIVE: 'Этот товар больше не продаётся',
    BELOW_MIN: 'Меньше минимального заказа',
    NOT_MULTIPLE_OF_STEP: 'Количество не кратно шагу продажи',
    INVALID_QTY: 'Неверное количество',
    INVALID_PASSWORD: 'Неверный пароль',
    LOGIN_RATE_LIMIT: 'Слишком много попыток, повторите позже',
    PASSWORD_NOT_SET: 'Пароль не установлен — обратитесь к администратору',
    PHONE_TAKEN: 'Этот номер уже зарегистрирован',
    CANNOT_MODIFY_SELF: 'Нельзя отключить свой аккаунт или понизить свою роль',
    INSUFFICIENT_STOCK: 'Недостаточно товара на складе',
    AMOUNT_EXCEEDS_DUE: 'Сумма больше остатка',
    METHOD_NOT_ALLOWED: 'Этот способ оплаты не согласован',
    TOO_MANY_PENDING: 'Предыдущие чеки ещё проверяются',
    ADVANCE_NOT_PAID: 'Аванс ещё не оплачен',
    CREDIT_LIMIT_EXCEEDED: 'Превышен кредитный лимит',
    TRANSITION_NO_SUCH_TRANSITION: 'Статус заказа изменился — обновите страницу',
    ORDER_CONFLICT: 'Заказ изменён другим пользователем — страница обновлена',
    STOCK_NOT_RECEIVED: 'Товар ещё не оприходован на склад',
  },
  en: {
    NETWORK: 'No internet connection',
    CART_EMPTY: 'Your cart is empty',
    CART_HAS_ISSUES: 'Please fix some items in your cart',
    OUT_OF_STOCK: 'Out of stock',
    INACTIVE: 'This item is no longer sold',
    BELOW_MIN: 'Below the minimum order quantity',
    NOT_MULTIPLE_OF_STEP: 'Quantity does not match the sales step',
    INVALID_QTY: 'Invalid quantity',
    INVALID_PASSWORD: 'Incorrect password',
    LOGIN_RATE_LIMIT: 'Too many attempts, please try again later',
    PASSWORD_NOT_SET: 'No password set — please contact your administrator',
    PHONE_TAKEN: 'This phone number is already registered',
    CANNOT_MODIFY_SELF: 'You cannot deactivate or demote your own account',
    INSUFFICIENT_STOCK: 'Not enough stock in the warehouse',
    AMOUNT_EXCEEDS_DUE: 'Amount exceeds the balance due',
    METHOD_NOT_ALLOWED: 'This payment method was not agreed',
    TOO_MANY_PENDING: 'Your previous receipts are still being reviewed',
    ADVANCE_NOT_PAID: 'The advance has not been paid yet',
    CREDIT_LIMIT_EXCEEDED: 'Credit limit exceeded',
    TRANSITION_NO_SUCH_TRANSITION: 'The order status has changed — please refresh',
    ORDER_CONFLICT: 'The order was changed by another user — page refreshed',
    STOCK_NOT_RECEIVED: 'The goods have not been received into the warehouse yet',
  },
};

export function apiErrorText(code: string | undefined, locale: Locale, fallback: string): string {
  return (code && API_ERRORS[locale][code]) || fallback;
}
