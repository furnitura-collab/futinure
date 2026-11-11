import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES } from './enums.js';
import {
  ORDER_TRANSITIONS,
  TERMINAL_STATUSES,
  availableTransitions,
  checkTransition,
} from './order-state-machine.js';

describe('order state machine', () => {
  it('menejer yangi buyurtmani yig\'ishga beradi, mijoz va omborchi yo\'q', () => {
    expect(checkTransition({ from: 'NEW', to: 'PREPARING', role: 'MANAGER', deliveryType: 'DELIVERY' }).ok).toBe(true);
    for (const role of ['CUSTOMER', 'WAREHOUSE'] as const) {
      expect(checkTransition({ from: 'NEW', to: 'PREPARING', role, deliveryType: 'DELIVERY' })).toEqual({
        ok: false,
        reason: 'FORBIDDEN_ROLE',
      });
    }
  });

  it('yetkazish turi bo\'yicha READY dan chiqish', () => {
    expect(checkTransition({ from: 'READY', to: 'OUT_FOR_DELIVERY', role: 'DRIVER', deliveryType: 'PICKUP' })).toEqual({
      ok: false,
      reason: 'WRONG_DELIVERY_TYPE',
    });
    expect(checkTransition({ from: 'READY', to: 'DELIVERED', role: 'WAREHOUSE', deliveryType: 'DELIVERY' })).toEqual({
      ok: false,
      reason: 'WRONG_DELIVERY_TYPE',
    });
    expect(checkTransition({ from: 'READY', to: 'DELIVERED', role: 'WAREHOUSE', deliveryType: 'PICKUP' }).ok).toBe(true);
  });

  it('mijoz faqat NEW da bekor qila oladi', () => {
    for (const from of ORDER_STATUSES) {
      const r = checkTransition({ from, to: 'CANCELLED', role: 'CUSTOMER', deliveryType: 'DELIVERY', comment: 'x' });
      expect(r.ok, from).toBe(from === 'NEW');
    }
  });

  it('READY ni faqat super admin bekor qiladi', () => {
    const base = { from: 'READY', to: 'CANCELLED', deliveryType: 'DELIVERY', comment: 'x' } as const;
    expect(checkTransition({ ...base, role: 'MANAGER' }).ok).toBe(false);
    expect(checkTransition({ ...base, role: 'SUPER_ADMIN' }).ok).toBe(true);
  });

  it('DELIVERED → COMPLETED faqat tizim', () => {
    expect(checkTransition({ from: 'DELIVERED', to: 'COMPLETED', role: 'SUPER_ADMIN', deliveryType: 'PICKUP' }).ok).toBe(false);
    expect(checkTransition({ from: 'DELIVERED', to: 'COMPLETED', role: null, deliveryType: 'PICKUP' }).ok).toBe(true);
  });

  it('yakuniy statuslardan chiqish yo\'q', () => {
    for (const t of ORDER_TRANSITIONS) expect(TERMINAL_STATUSES).not.toContain(t.from);
  });

  it('har bir yakuniy bo\'lmagan statusdan kamida bitta chiqish bor', () => {
    for (const s of ORDER_STATUSES.filter((s) => !TERMINAL_STATUSES.includes(s))) {
      expect(ORDER_TRANSITIONS.some((t) => t.from === s), s).toBe(true);
    }
  });

  it('dublikat o\'tish yo\'q', () => {
    const keys = ORDER_TRANSITIONS.map((t) => `${t.from}>${t.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('availableTransitions omborchi uchun', () => {
    expect(availableTransitions('READY', 'WAREHOUSE', 'PICKUP').map((t) => t.to)).toEqual(['DELIVERED']);
    expect(availableTransitions('READY', 'WAREHOUSE', 'DELIVERY')).toEqual([]);
  });
});
