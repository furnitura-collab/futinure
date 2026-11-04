import { z } from 'zod';
import { normalizeUzPhone } from '../phone.js';
import { CUSTOMER_TYPES, LOCALES } from '../enums.js';

export const phoneSchema = z.string().transform((v, ctx) => {
  const phone = normalizeUzPhone(v);
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: 'INVALID_PHONE' });
    return z.NEVER;
  }
  return phone;
});

export const otpRequestSchema = z.object({
  phone: phoneSchema,
});
export type OtpRequest = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{4,6}$/, 'INVALID_CODE'),
});
export type OtpVerify = z.infer<typeof otpVerifySchema>;

export const PASSWORD_MIN = 6;

export const passwordLoginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(PASSWORD_MIN, 'PASSWORD_TOO_SHORT').max(100),
});
export type PasswordLogin = z.infer<typeof passwordLoginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const updateMeSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    locale: z.enum(LOCALES),
    customerType: z.enum(CUSTOMER_TYPES),
    companyName: z.string().trim().max(200).nullable(),
    inn: z
      .string()
      .regex(/^\d{9}$/, 'INVALID_INN')
      .nullable(),
  })
  .partial();
export type UpdateMe = z.infer<typeof updateMeSchema>;

export const deviceTokenSchema = z.object({
  token: z.string().min(10).max(300),
  platform: z.enum(['ios', 'android', 'web']),
});
export type DeviceTokenInput = z.infer<typeof deviceTokenSchema>;
