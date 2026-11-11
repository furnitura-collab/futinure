import { describe, expect, it } from 'vitest';
import { amountDueNow, attributeLabel, attributeValue, customerStage, type AmountDueInput } from './customer-order.js';

const base: AmountDueInput = {
  status: 'NEW',
  paymentTerms: 'PREPAID',
  grandTotal: 1_000_000,
  paidTotal: 0,
  advanceAmount: 0,
  dueDate: null,
  today: '2026-11-04',
};

describe('mijoz bosqichlari', () => {
  it('7 ta status 4 bosqichga tushadi, bekor qilingan — -1', () => {
    expect(customerStage('NEW')).toBe(0);
    expect(customerStage('PREPARING')).toBe(1);
    expect(customerStage('READY')).toBe(2);
    expect(customerStage('OUT_FOR_DELIVERY')).toBe(2);
    expect(customerStage('COMPLETED')).toBe(3);
    expect(customerStage('CANCELLED')).toBe(-1);
  });
});

describe('hozir to\'lanadigan summa', () => {
  it('shartlar belgilanmagan yoki bekor qilingan buyurtmada to\'lov so\'ralmaydi', () => {
    expect(amountDueNow({ ...base, status: 'CANCELLED' })).toBe(0);
    expect(amountDueNow({ ...base, paymentTerms: null })).toBe(0);
  });

  it('to\'liq oldindan — qolgan hamma summa, tekshirilayotgan chek ayriladi', () => {
    expect(amountDueNow({ ...base, paidTotal: 200_000 })).toBe(800_000);
    expect(amountDueNow({ ...base, paidTotal: 200_000, pendingTotal: 800_000 })).toBe(0);
  });

  it('avans — tayyorlanishdan oldin avans, topshirishda qolgani', () => {
    const adv = { ...base, paymentTerms: 'ADVANCE' as const, advanceAmount: 300_000 };
    expect(amountDueNow(adv)).toBe(300_000);
    expect(amountDueNow({ ...adv, status: 'PREPARING', paidTotal: 300_000 })).toBe(0);
    expect(amountDueNow({ ...adv, status: 'READY', paidTotal: 300_000 })).toBe(700_000);
  });

  it('topshirishda — tayyor bo\'lgach', () => {
    const cod = { ...base, paymentTerms: 'ON_DELIVERY' as const };
    expect(amountDueNow({ ...cod, status: 'PREPARING' })).toBe(0);
    expect(amountDueNow({ ...cod, status: 'OUT_FOR_DELIVERY' })).toBe(1_000_000);
  });

  it('nasiya — muddati kelgandagina', () => {
    const credit = { ...base, paymentTerms: 'CREDIT' as const, status: 'DELIVERED' as const };
    expect(amountDueNow({ ...credit, dueDate: '2026-11-20' })).toBe(0);
    expect(amountDueNow({ ...credit, dueDate: new Date('2026-11-04T00:00:00Z') })).toBe(1_000_000);
  });
});

describe('atribut nomlari', () => {
  it('ma\'lum kalit tarjima qilinadi, noma\'lumi o\'qiladigan qilinadi', () => {
    expect(attributeLabel('thickness', 'uz')).toBe('Qalinlik');
    expect(attributeLabel('color', 'ru')).toBe('Цвет');
    expect(attributeLabel('edge_type', 'en')).toBe('Edge type');
  });

  it('o\'lchovli qiymatga birlik qo\'shiladi', () => {
    expect(attributeValue('thickness', 16)).toBe('16 mm');
    expect(attributeValue('angle', '110°')).toBe('110°');
    expect(attributeValue('color', 'Oq')).toBe('Oq');
  });
});
