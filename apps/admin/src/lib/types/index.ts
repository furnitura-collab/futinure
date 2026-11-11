/**
 * API javoblarining admin ishlatadigan qismi.
 * Pul — number (so'm), miqdor — string ("12.5"), sana — ISO string.
 */
import type { Locale, Role } from '@mebel/shared';

export type { Paginated } from '@mebel/shared';
export type * from './orders';
export type * from './catalog';
export type * from './customers';

export interface Me {
  id: string;
  phone: string;
  fullName: string | null;
  role: Role;
  locale: Locale;
}
