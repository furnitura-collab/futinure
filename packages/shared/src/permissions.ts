import type { Role } from './enums.js';

/**
 * Rollar ruxsatlari — yagona manba (docs/15-roles-permissions-prompt.md).
 * Server nusxasi: apps/api-py/app/auth/permissions.py (tests/test_unit.py solishtiradi).
 * Holat o'tishlari alohida — order-state-machine.ts.
 */
export const PERMISSIONS = {
  'orders.view': ['WAREHOUSE', 'MANAGER', 'SUPER_ADMIN'],
  'orders.manage': ['MANAGER', 'SUPER_ADMIN'],
  'orders.finance': ['MANAGER', 'SUPER_ADMIN'],
  'orders.chat': ['MANAGER', 'SUPER_ADMIN'],
  // Avansni chetlab o'tib qabul qilish, raspil boshlangan buyurtmani bekor qilish
  'orders.override': ['SUPER_ADMIN'],
  'payments.manage': ['MANAGER', 'SUPER_ADMIN'],
  'payments.adjust': ['SUPER_ADMIN'],
  'catalog.view': ['WAREHOUSE', 'MANAGER', 'SUPER_ADMIN'],
  'catalog.edit': ['MANAGER', 'SUPER_ADMIN'],
  'catalog.delete': ['SUPER_ADMIN'],
  'prices.manage': ['SUPER_ADMIN'],
  'stock.manage': ['WAREHOUSE', 'MANAGER', 'SUPER_ADMIN'],
  'customers.manage': ['MANAGER', 'SUPER_ADMIN'],
  'staff.manage': ['SUPER_ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const hasPermission = (role: Role | null | undefined, p: Permission): boolean =>
  !!role && (PERMISSIONS[p] as readonly Role[]).includes(role);

/** Omborchi ko'radigan buyurtmalar — qabul qilingan va hali yetkazilmagan (yig'ish, tayyor, yo'lda) */
export const WAREHOUSE_ORDER_STATUSES = ['PREPARING', 'READY', 'OUT_FOR_DELIVERY'] as const;
