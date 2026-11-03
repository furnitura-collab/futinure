import { HttpStatus, Injectable } from '@nestjs/common';
import type { ChatListQuery, ChatMessageInput } from '@mebel/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import type { AuthUser } from '../auth/decorators.js';
import { OutboxService } from '../events/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const CHAT_PURPOSE = 'CHAT';

const messageInclude = {
  sender: { select: { id: true, fullName: true, role: true } },
  attachment: { select: { id: true, mimeType: true, size: true } },
} satisfies Prisma.ChatMessageInclude;

const isStaff = (u: AuthUser) => u.role === 'MANAGER' || u.role === 'SUPER_ADMIN';

/** Buyurtma ichidagi chat: mijoz ↔ menejerlar */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async list(orderId: string, viewer: AuthUser, q: ChatListQuery) {
    await this.access(orderId, viewer);
    let cursor: Prisma.ChatMessageWhereInput = {};
    if (q.before) {
      const ref = await this.prisma.chatMessage.findFirst({ where: { id: q.before, orderId }, select: { createdAt: true, id: true } });
      if (ref) cursor = { OR: [{ createdAt: { lt: ref.createdAt } }, { createdAt: ref.createdAt, id: { lt: ref.id } }] };
    }
    const rows = await this.prisma.chatMessage.findMany({
      where: { orderId, ...cursor },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: messageInclude,
    });
    const hasMore = rows.length > q.limit;
    // Ekranda eskidan yangiga
    return { items: rows.slice(0, q.limit).reverse(), hasMore };
  }

  async send(orderId: string, sender: AuthUser, input: ChatMessageInput) {
    return this.prisma.$transaction(async (tx) => {
      await this.access(orderId, sender, tx);
      if (input.attachmentUploadId) {
        const upload = await tx.upload.findFirst({
          where: { id: input.attachmentUploadId, ownerId: sender.id, purpose: CHAT_PURPOSE },
          select: { chatMessage: { select: { id: true } } },
        });
        if (!upload) throw AppException.notFound('Fayl');
        if (upload.chatMessage) throw new AppException('ATTACHMENT_ALREADY_USED', 'Fayl boshqa xabarga biriktirilgan', HttpStatus.CONFLICT);
      }
      const message = await tx.chatMessage.create({
        data: {
          orderId,
          senderId: sender.id,
          text: input.text ?? null,
          attachmentUploadId: input.attachmentUploadId ?? null,
          // O'z xabari o'zi uchun o'qilgan
          ...(isStaff(sender) ? { readByStaffAt: new Date() } : { readByCustomerAt: new Date() }),
        },
        include: messageInclude,
      });
      await this.outbox.add(tx, 'chat.message', { messageId: message.id });
      return message;
    });
  }

  /** Qarshi tomonning barcha xabarlarini o'qilgan deb belgilaydi */
  async markRead(orderId: string, viewer: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      await this.access(orderId, viewer, tx);
      const staff = isStaff(viewer);
      const { count } = await tx.chatMessage.updateMany({
        where: staff
          ? { orderId, readByStaffAt: null, sender: { role: 'CUSTOMER' } }
          : { orderId, readByCustomerAt: null, sender: { role: { not: 'CUSTOMER' } } },
        data: staff ? { readByStaffAt: new Date() } : { readByCustomerAt: new Date() },
      });
      if (count) await this.outbox.add(tx, 'chat.read', { orderId, readerRole: staff ? 'STAFF' : 'CUSTOMER' });
      return { updated: count };
    });
  }

  async attachment(messageId: string, viewer: AuthUser) {
    const m = await this.prisma.chatMessage.findUnique({ where: { id: messageId }, select: { orderId: true, attachment: true } });
    if (!m) throw AppException.notFound('Xabar');
    await this.access(m.orderId, viewer);
    if (!m.attachment) throw AppException.notFound('Fayl');
    return m.attachment;
  }

  private async access(orderId: string, viewer: AuthUser, db: Prisma.TransactionClient = this.prisma) {
    const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, customerId: true } });
    const allowed = order && (isStaff(viewer) || (viewer.role === 'CUSTOMER' && order.customerId === viewer.id));
    if (!allowed) throw AppException.notFound('Buyurtma');
    return order;
  }
}
