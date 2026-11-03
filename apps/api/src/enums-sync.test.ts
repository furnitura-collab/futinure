import { describe, expect, it } from 'vitest';
import * as shared from '@mebel/shared';
import * as db from './generated/prisma/enums.js';

/** @mebel/shared enumlari Prisma sxemasidagilar bilan bir xil bo'lishi kerak */
const pairs: [string, readonly string[], Record<string, string>][] = [
  ['Role', shared.ROLES, db.Role],
  ['Locale', shared.LOCALES, db.Locale],
  ['CustomerType', shared.CUSTOMER_TYPES, db.CustomerType],
  ['Unit', shared.UNITS, db.Unit],
  ['ProductKind', shared.PRODUCT_KINDS, db.ProductKind],
  ['Availability', shared.AVAILABILITIES, db.Availability],
  ['OrderStatus', shared.ORDER_STATUSES, db.OrderStatus],
  ['DeliveryType', shared.DELIVERY_TYPES, db.DeliveryType],
  ['PaymentTerms', shared.PAYMENT_TERMS, db.PaymentTerms],
  ['PaymentMethod', shared.PAYMENT_METHODS, db.PaymentMethod],
  ['PaymentStatus', shared.PAYMENT_STATUSES, db.PaymentStatus],
  ['QuoteStatus', shared.QUOTE_STATUSES, db.QuoteStatus],
  ['LedgerType', shared.LEDGER_TYPES, db.LedgerType],
  ['StockMovementType', shared.STOCK_MOVEMENT_TYPES, db.StockMovementType],
  ['OrderItemStatus', shared.ORDER_ITEM_STATUSES, db.OrderItemStatus],
  ['PriceChangeSource', shared.PRICE_CHANGE_SOURCES, db.PriceChangeSource],
  ['DeliveryStatus', shared.DELIVERY_STATUSES, db.DeliveryStatus],
];

describe('enum sinxronligi', () => {
  it.each(pairs)('%s', (_name, sharedValues, dbEnum) => {
    expect([...sharedValues].sort()).toEqual(Object.values(dbEnum).sort());
  });
});
