import { HttpStatus } from '@nestjs/common';
import { addDays, businessDate, isValidIsoDate, MAX_DELIVERY_DAYS_AHEAD, type OrderTermsInput } from '@mebel/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';

export interface Totals {
  itemsTotal: number;
  servicesTotal: number;
  deliveryFee: number;
  discountTotal: number;
  grandTotal: number;
}

/** Shartlarni mijoz profili va summaga nisbatan tekshiradi */
export function validateTerms(
  terms: OrderTermsInput,
  totals: Totals,
  profile: { creditLimit: bigint } | null,
) {
  const subtotal = totals.itemsTotal + totals.servicesTotal + totals.deliveryFee;
  if (terms.discountTotal > subtotal) {
    throw new AppException('DISCOUNT_TOO_LARGE', 'Chegirma summadan katta', HttpStatus.UNPROCESSABLE_ENTITY);
  }
  if (terms.advanceAmount > totals.grandTotal) {
    throw new AppException('ADVANCE_TOO_LARGE', 'Avans jami summadan katta', HttpStatus.UNPROCESSABLE_ENTITY);
  }
  if (terms.paymentTerms === 'CREDIT' && (!profile || profile.creditLimit <= 0n)) {
    throw new AppException('CREDIT_NOT_ALLOWED', 'Bu mijozga nasiya ochilmagan (kredit limiti 0)', HttpStatus.UNPROCESSABLE_ENTITY);
  }
  if (terms.deliveryDate) {
    const today = businessDate();
    if (!isValidIsoDate(terms.deliveryDate) || terms.deliveryDate < today || terms.deliveryDate > addDays(today, MAX_DELIVERY_DAYS_AHEAD)) {
      throw new AppException('INVALID_DELIVERY_DATE', 'Yetkazish sanasi noto\'g\'ri', HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }
}

/** Shartlar va summalarni buyurtmaga yozish uchun */
export function termsData(terms: OrderTermsInput, totals: Totals): Prisma.OrderUncheckedUpdateManyInput {
  return {
    paymentTerms: terms.paymentTerms,
    advanceAmount: BigInt(terms.advanceAmount),
    allowedMethods: terms.allowedMethods,
    deliveryFee: BigInt(totals.deliveryFee),
    discountTotal: BigInt(totals.discountTotal),
    itemsTotal: BigInt(totals.itemsTotal),
    servicesTotal: BigInt(totals.servicesTotal),
    grandTotal: BigInt(totals.grandTotal),
    ...(terms.deliveryDate !== undefined && {
      deliveryDate: terms.deliveryDate ? new Date(`${terms.deliveryDate}T00:00:00Z`) : null,
    }),
    ...(terms.vehicleType !== undefined && { vehicleType: terms.vehicleType }),
  };
}
