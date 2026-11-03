import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { addressInputSchema, addressUpdateSchema, type AddressInput, type AddressUpdate } from '@mebel/shared';
import { AppException } from '../common/app-exception.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { type AuthUser, CurrentUser, Public, Roles } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

const uuid = new ParseUUIDPipe();
const MAX_ADDRESSES = 20;

@Roles('CUSTOMER')
@Controller('addresses')
export class AddressesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.prisma.address.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' } });
  }

  @Post()
  async create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(addressInputSchema)) body: AddressInput) {
    if ((await this.prisma.address.count({ where: { userId: u.id } })) >= MAX_ADDRESSES) {
      throw new AppException('TOO_MANY_ADDRESSES', `Ko'pi bilan ${MAX_ADDRESSES} ta manzil`);
    }
    return this.prisma.address.create({ data: { ...body, userId: u.id } });
  }

  @Patch(':id')
  async update(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(addressUpdateSchema)) body: AddressUpdate) {
    const { count } = await this.prisma.address.updateMany({ where: { id, userId: u.id }, data: body });
    if (!count) throw AppException.notFound('Manzil');
    return this.prisma.address.findUniqueOrThrow({ where: { id } });
  }

  /** Buyurtmalarda manzil nusxasi saqlanadi — o'chirish eski buyurtmalarga ta'sir qilmaydi */
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    const { count } = await this.prisma.address.deleteMany({ where: { id, userId: u.id } });
    if (!count) throw AppException.notFound('Manzil');
  }
}

@Public()
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, addressText: true, lat: true, lng: true, phone: true, workHours: true },
    });
  }
}
