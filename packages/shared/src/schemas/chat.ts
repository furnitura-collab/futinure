import { z } from 'zod';
import { uuidSchema } from './common.js';

export const chatMessageInputSchema = z
  .object({
    text: z.string().trim().min(1).max(4000).optional(),
    attachmentUploadId: uuidSchema.optional(),
  })
  .refine((v) => v.text || v.attachmentUploadId, 'EMPTY_MESSAGE');
export type ChatMessageInput = z.infer<typeof chatMessageInputSchema>;

/** Eskiroq xabarlarni yuklash: before — eng eski ko'rilgan xabar id'si */
export const chatListQuerySchema = z.object({
  before: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ChatListQuery = z.infer<typeof chatListQuerySchema>;

export const notificationsReadSchema = z
  .object({
    ids: z.array(uuidSchema).max(200).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => v.all || v.ids?.length, 'IDS_OR_ALL_REQUIRED');
export type NotificationsReadInput = z.infer<typeof notificationsReadSchema>;

/**
 * Socket.IO (namespace /rt) hodisalari. Ulanish: io('/rt', { auth: { token } }).
 * Xonalar avtomatik: user:{id}; xodimlar — staff. Buyurtma xonasi: emit('order.subscribe', { orderId }).
 */
export const RT = {
  ORDER_CREATED: 'order.created',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  /** Yangi buyurtmaga shartlar saqlandi (oldindan to'lovda mijoz to'lovni shundan keyin qiladi) */
  ORDER_TERMS_SET: 'order.terms_set',
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_UPDATED: 'payment.updated',
  CHAT_MESSAGE: 'chat.message',
  CHAT_READ: 'chat.read',
  DELIVERY_ASSIGNED: 'delivery.assigned',
  NOTIFICATION: 'notification',
  ORDER_SUBSCRIBE: 'order.subscribe',
  ORDER_UNSUBSCRIBE: 'order.unsubscribe',
} as const;
