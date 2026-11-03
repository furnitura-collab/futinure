// Enum qiymatlari Prisma sxemasidagi enumlar bilan bir xil bo'lishi shart.
// apps/api dagi test buni tekshiradi (enums-sync.test.ts).

const values = <const T extends readonly string[]>(...v: T) => v;

export const ROLES = values('CUSTOMER', 'MANAGER', 'SUPER_ADMIN', 'WAREHOUSE', 'DRIVER');
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: readonly Role[] = ['MANAGER', 'SUPER_ADMIN', 'WAREHOUSE', 'DRIVER'];

export const LOCALES = values('uz', 'ru');
export type Locale = (typeof LOCALES)[number];

export const CUSTOMER_TYPES = values('INDIVIDUAL', 'MASTER', 'COMPANY');
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const UNITS = values('PIECE', 'SHEET', 'METER', 'SQM', 'KG', 'SET', 'PACK');
export type Unit = (typeof UNITS)[number];

export const PRODUCT_KINDS = values('GOODS', 'BOARD', 'EDGE');
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const AVAILABILITIES = values('IN_STOCK', 'ON_ORDER', 'OUT_OF_STOCK');
export type Availability = (typeof AVAILABILITIES)[number];

export const ORDER_STATUSES = values(
  'NEW',
  'QUOTED',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
);
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const DELIVERY_TYPES = values('DELIVERY', 'PICKUP');
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

export const PAYMENT_TERMS = values('PREPAID', 'ADVANCE', 'ON_DELIVERY', 'CREDIT');
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

export const PAYMENT_METHODS = values('CASH', 'CARD_TRANSFER', 'CLICK', 'PAYME', 'BANK_TRANSFER');
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = values('PENDING', 'CONFIRMED', 'REJECTED');
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const QUOTE_STATUSES = values('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'EXPIRED');
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const LEDGER_TYPES = values('DEBIT', 'CREDIT', 'ADJUSTMENT', 'REFUND');
export type LedgerType = (typeof LEDGER_TYPES)[number];

export const STOCK_MOVEMENT_TYPES = values('IN', 'OUT', 'ADJUST', 'RESERVE', 'RELEASE');
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const ORDER_ITEM_STATUSES = values('ACTIVE', 'REMOVED');
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];

export const PRICE_CHANGE_SOURCES = values('MANUAL', 'BULK', 'IMPORT');
export type PriceChangeSource = (typeof PRICE_CHANGE_SOURCES)[number];

export const DELIVERY_STATUSES = values('ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'FAILED');
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
