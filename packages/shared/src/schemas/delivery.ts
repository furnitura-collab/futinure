import { z } from 'zod';
import { moneySchema, uuidSchema } from './common.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'INVALID_DATE');

/** Menejer: yetkazishga haydovchi biriktiradi (driverId=null — biriktirishni olib tashlash) */
export const assignDeliverySchema = z.object({
  driverId: uuidSchema.nullable(),
  scheduledDate: isoDate.nullable().optional(),
  slot: z.string().trim().max(40).nullable().optional(),
  vehicleType: z.string().trim().max(20).nullable().optional(),
});
export type AssignDeliveryInput = z.infer<typeof assignDeliverySchema>;

/** Haydovchi: yo'lga chiqdim */
export const driverStartSchema = z.object({
  expectedVersion: z.number().int().optional(),
});
export type DriverStartInput = z.infer<typeof driverStartSchema>;

/** Haydovchi: topshirdim */
export const driverDeliverSchema = z.object({
  receiverName: z.string().trim().min(2).max(120),
  /** /uploads/delivery-proof orqali yuklangan surat */
  proofUploadId: uuidSchema.optional(),
  /** Mijozdan olingan naqd pul — kassaga topshirilganda menejer tasdiqlaydi */
  cashCollected: moneySchema.optional(),
  comment: z.string().trim().max(1000).optional(),
  expectedVersion: z.number().int().optional(),
});
export type DriverDeliverInput = z.infer<typeof driverDeliverSchema>;

/** Haydovchi: yetkazib bo'lmadi — buyurtma omborga (READY) qaytadi */
export const driverFailSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  expectedVersion: z.number().int().optional(),
});
export type DriverFailInput = z.infer<typeof driverFailSchema>;

/** Mobil ilovada tez tanlash uchun sabablar (kalitlar i18n'da) */
export const DRIVER_FAIL_REASONS = ['NO_ANSWER', 'NOT_AT_HOME', 'REFUSED', 'WRONG_ADDRESS', 'NO_MONEY', 'VEHICLE'] as const;
export type DriverFailReason = (typeof DRIVER_FAIL_REASONS)[number];
