import { describe, expect, it } from 'vitest';
import { ROLES } from './enums.js';
import { hasPermission, PERMISSIONS } from './permissions.js';

describe('permissions', () => {
  it('super admin hamma narsaga ruxsatli', () => {
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) expect(hasPermission('SUPER_ADMIN', p)).toBe(true);
  });

  it('mijoz va haydovchiga xodim ruxsatlari yo\'q', () => {
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(hasPermission('CUSTOMER', p)).toBe(false);
      expect(hasPermission('DRIVER', p)).toBe(false);
    }
  });

  it('omborchi: buyurtma va ombor — ha, moliya va boshqaruv — yo\'q', () => {
    expect(hasPermission('WAREHOUSE', 'orders.view')).toBe(true);
    expect(hasPermission('WAREHOUSE', 'stock.manage')).toBe(true);
    for (const p of ['orders.manage', 'orders.finance', 'payments.manage', 'catalog.edit', 'customers.manage'] as const)
      expect(hasPermission('WAREHOUSE', p)).toBe(false);
  });

  it('faqat ma\'lum rollar va rolsiz — ruxsat yo\'q', () => {
    for (const roles of Object.values(PERMISSIONS)) for (const r of roles) expect(ROLES).toContain(r);
    expect(hasPermission(null, 'orders.view')).toBe(false);
  });
});
