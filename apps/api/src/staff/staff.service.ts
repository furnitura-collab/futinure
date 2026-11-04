import { HttpStatus, Injectable } from '@nestjs/common';
import { STAFF_ROLES, type CreateStaff, type UpdateStaff } from '@mebel/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/decorators.js';
import { hashPassword } from '../auth/password.js';
import { TokenService } from '../auth/token.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const STAFF_SELECT = {
  id: true,
  phone: true,
  fullName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const STAFF_WHERE = { role: { in: [...STAFF_ROLES] } } satisfies Prisma.UserWhereInput;

/** Xodimlar — faqat super admin boshqaradi */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.user.findMany({
      where: STAFF_WHERE,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: STAFF_SELECT,
    });
  }

  async create(input: CreateStaff, actor: AuthUser) {
    const { password, ...data } = input;
    if (await this.prisma.user.count({ where: { phone: data.phone } })) throw phoneTaken();
    const passwordHash = await hashPassword(password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const staff = await tx.user.create({ data: { ...data, passwordHash }, select: STAFF_SELECT });
        await this.audit.log({ actorId: actor.id, entity: 'staff', entityId: staff.id, action: 'create', after: data }, tx);
        return staff;
      });
    } catch (e) {
      // Parallel so'rov shu raqamni oldinroq band qilgan bo'lishi mumkin
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw phoneTaken();
      throw e;
    }
  }

  async update(id: string, input: UpdateStaff, actor: AuthUser) {
    const before = await this.prisma.user.findFirst({ where: { id, ...STAFF_WHERE }, select: STAFF_SELECT });
    if (!before) throw AppException.notFound('Xodim');
    // Tizim super adminsiz qolib ketmasin
    if (id === actor.id && (input.isActive === false || (input.role && input.role !== 'SUPER_ADMIN'))) {
      throw new AppException('CANNOT_MODIFY_SELF', 'O\'zingizni bloklay yoki rolingizni pasaytira olmaysiz', HttpStatus.BAD_REQUEST);
    }

    const { password, ...data } = input;
    const staff = await this.prisma.$transaction(async (tx) => {
      const after = await tx.user.update({
        where: { id },
        data: { ...data, ...(password && { passwordHash: await hashPassword(password) }) },
        select: STAFF_SELECT,
      });
      await this.audit.log(
        { actorId: actor.id, entity: 'staff', entityId: id, action: 'update', before, after: { ...data, ...(password && { password: '***' }) } },
        tx,
      );
      return after;
    });
    // Parol almashsa yoki bloklansa — barcha qurilmalardan chiqariladi (access token 15 daqiqada tugaydi)
    if (password || input.isActive === false) await this.tokens.revokeAllForUser(id);
    return staff;
  }
}

function phoneTaken() {
  return new AppException('PHONE_TAKEN', 'Bu raqam allaqachon ro\'yxatdan o\'tgan', HttpStatus.CONFLICT);
}
