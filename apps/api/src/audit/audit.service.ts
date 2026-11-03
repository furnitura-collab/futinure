import { Global, Injectable, Module } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { serialize } from '../common/serialize.interceptor.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type Tx = Prisma.TransactionClient;

export interface AuditEntry {
  actorId: string | null;
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Kim, nimani, qachon o'zgartirdi. O'zgarish bilan bir tranzaksiyada yoziladi —
 * o'zgarish bekor bo'lsa, log ham qolmaydi.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx: Tx = this.prisma) {
    await tx.auditLog.create({
      data: {
        actorId: entry.actorId,
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        before: toJson(entry.before),
        after: toJson(entry.after),
      },
    });
  }
}

function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  return v === undefined ? undefined : (serialize(v) as Prisma.InputJsonValue);
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
