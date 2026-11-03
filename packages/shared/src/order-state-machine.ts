import type { DeliveryType, OrderStatus, Role } from './enums.js';

/**
 * Buyurtma statuslari o'tishlari. To'liq tavsif: docs/02-state-machine.md.
 *
 * Bu yerda faqat "sof" qoidalar: kim, qayerdan, qayerga, qaysi yetkazish turida.
 * Ma'lumotlar bazasiga bog'liq shartlar (qoldiq, avans, kredit limiti) API'dagi
 * OrderStateMachine servisida tekshiriladi.
 */
export interface Transition {
  from: OrderStatus;
  to: OrderStatus;
  roles: readonly Role[];
  deliveryType?: DeliveryType;
  /** Izoh/sabab majburiymi */
  requiresComment?: boolean;
}

const MGR: readonly Role[] = ['MANAGER', 'SUPER_ADMIN'];
const SYSTEM: readonly Role[] = [];

export const ORDER_TRANSITIONS: readonly Transition[] = [
  { from: 'NEW', to: 'CONFIRMED', roles: MGR },
  { from: 'NEW', to: 'QUOTED', roles: MGR },
  { from: 'QUOTED', to: 'CONFIRMED', roles: ['CUSTOMER'] },
  { from: 'QUOTED', to: 'NEW', roles: ['CUSTOMER'], requiresComment: true },
  { from: 'CONFIRMED', to: 'PREPARING', roles: [...MGR, 'WAREHOUSE'] },
  { from: 'PREPARING', to: 'READY', roles: [...MGR, 'WAREHOUSE'] },
  { from: 'READY', to: 'OUT_FOR_DELIVERY', roles: [...MGR, 'DRIVER'], deliveryType: 'DELIVERY' },
  { from: 'READY', to: 'DELIVERED', roles: [...MGR, 'WAREHOUSE'], deliveryType: 'PICKUP' },
  { from: 'OUT_FOR_DELIVERY', to: 'DELIVERED', roles: [...MGR, 'DRIVER'] },
  { from: 'OUT_FOR_DELIVERY', to: 'READY', roles: [...MGR, 'DRIVER'], requiresComment: true },
  { from: 'DELIVERED', to: 'COMPLETED', roles: SYSTEM },

  { from: 'NEW', to: 'CANCELLED', roles: ['CUSTOMER', ...MGR], requiresComment: true },
  { from: 'QUOTED', to: 'CANCELLED', roles: ['CUSTOMER', ...MGR], requiresComment: true },
  { from: 'CONFIRMED', to: 'CANCELLED', roles: MGR, requiresComment: true },
  // PREPARING'dan menejer faqat raspilsiz buyurtmani bekor qila oladi (API'da tekshiriladi)
  { from: 'PREPARING', to: 'CANCELLED', roles: MGR, requiresComment: true },
  { from: 'READY', to: 'CANCELLED', roles: ['SUPER_ADMIN'], requiresComment: true },
];

export const TERMINAL_STATUSES: readonly OrderStatus[] = ['COMPLETED', 'CANCELLED'];

/** Mijoz o'z buyurtmasini qaysi statuslarda bekor qila oladi */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = ['NEW', 'QUOTED'];

/** Shu statuslarda tovar rezervda turadi */
export const RESERVED_STATUSES: readonly OrderStatus[] = ['CONFIRMED', 'PREPARING', 'READY'];

export type TransitionCheck =
  | { ok: true; transition: Transition }
  | { ok: false; reason: 'NO_SUCH_TRANSITION' | 'FORBIDDEN_ROLE' | 'WRONG_DELIVERY_TYPE' | 'COMMENT_REQUIRED' };

export function findTransition(from: OrderStatus, to: OrderStatus): Transition | undefined {
  return ORDER_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

/**
 * @param role null bo'lsa — tizim (cron, avtomatik o'tish)
 */
export function checkTransition(params: {
  from: OrderStatus;
  to: OrderStatus;
  role: Role | null;
  deliveryType: DeliveryType;
  comment?: string | null;
}): TransitionCheck {
  const t = findTransition(params.from, params.to);
  if (!t) return { ok: false, reason: 'NO_SUCH_TRANSITION' };
  if (params.role !== null && !t.roles.includes(params.role)) {
    return { ok: false, reason: 'FORBIDDEN_ROLE' };
  }
  if (t.deliveryType && t.deliveryType !== params.deliveryType) {
    return { ok: false, reason: 'WRONG_DELIVERY_TYPE' };
  }
  if (t.requiresComment && !params.comment?.trim()) {
    return { ok: false, reason: 'COMMENT_REQUIRED' };
  }
  return { ok: true, transition: t };
}

/** UI uchun: shu rol shu statusdan qaysi statuslarga o'tkaza oladi */
export function availableTransitions(
  from: OrderStatus,
  role: Role,
  deliveryType: DeliveryType,
): Transition[] {
  return ORDER_TRANSITIONS.filter(
    (t) =>
      t.from === from &&
      t.roles.includes(role) &&
      (!t.deliveryType || t.deliveryType === deliveryType),
  );
}
