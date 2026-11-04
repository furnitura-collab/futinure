import { z } from 'zod';
import { STAFF_ROLES, type Role } from '../enums.js';
import { PASSWORD_MIN, phoneSchema } from './auth.js';

const passwordSchema = z.string().min(PASSWORD_MIN, 'PASSWORD_TOO_SHORT').max(100);
const staffRoleSchema = z.enum(STAFF_ROLES as [Role, ...Role[]]).refine((r) => r !== 'CUSTOMER', 'INVALID_ROLE');

/** POST /admin/staff — faqat SUPER_ADMIN */
export const createStaffSchema = z.object({
  phone: phoneSchema,
  fullName: z.string().trim().min(2).max(120),
  role: staffRoleSchema,
  password: passwordSchema,
});
export type CreateStaff = z.infer<typeof createStaffSchema>;

/** PATCH /admin/staff/:id — faqat SUPER_ADMIN; `password` berilsa parol almashtiriladi va sessiyalar yopiladi */
export const updateStaffSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    role: staffRoleSchema,
    isActive: z.boolean(),
    password: passwordSchema,
  })
  .partial();
export type UpdateStaff = z.infer<typeof updateStaffSchema>;

/** POST /me/password — parol o'rnatilgan bo'lsa `currentPassword` majburiy */
export const changePasswordSchema = z.object({
  currentPassword: z.string().max(100).optional(),
  newPassword: passwordSchema,
});
export type ChangePassword = z.infer<typeof changePasswordSchema>;
