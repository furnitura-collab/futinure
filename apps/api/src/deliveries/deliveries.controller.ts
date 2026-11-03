import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  assignDeliverySchema,
  driverDeliverSchema,
  driverFailSchema,
  driverStartSchema,
  type AssignDeliveryInput,
  type DriverDeliverInput,
  type DriverFailInput,
  type DriverStartInput,
} from '@mebel/shared';
import { AppException } from '../common/app-exception.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { type AuthUser, CurrentUser, Roles } from '../auth/decorators.js';
import { AdminOrdersService } from '../orders/admin-orders.service.js';
import { MAX_RECEIPT_BYTES, PrivateFilesService } from '../uploads/private-files.service.js';
import { DELIVERY_PROOF_PURPOSE, DeliveriesService } from './deliveries.service.js';

const uuid = new ParseUUIDPipe();

@Roles('MANAGER', 'SUPER_ADMIN')
@Controller('admin')
export class AdminDeliveriesController {
  constructor(
    private readonly deliveries: DeliveriesService,
    private readonly orders: AdminOrdersService,
    private readonly files: PrivateFilesService,
  ) {}

  @Get('drivers')
  drivers() {
    return this.deliveries.drivers();
  }

  /** Haydovchi biriktirish / almashtirish / olib tashlash */
  @Put('orders/:id/delivery')
  async assign(@Param('id', uuid) id: string, @Body(new ZodPipe(assignDeliverySchema)) body: AssignDeliveryInput, @CurrentUser() u: AuthUser) {
    await this.deliveries.assign(id, body, u);
    return this.orders.detail(id, u);
  }

  @Roles('MANAGER', 'SUPER_ADMIN', 'WAREHOUSE', 'DRIVER')
  @Get('orders/:id/delivery/proof')
  async proof(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser, @Res({ passthrough: true }) res: Response) {
    const file = await this.deliveries.proofFor(id, u);
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(this.files.open(file), { type: file.mimeType, disposition: 'inline' });
  }
}

/** Haydovchi mobil ilovasi */
@Roles('DRIVER')
@Controller('driver')
export class DriverController {
  constructor(
    private readonly deliveries: DeliveriesService,
    private readonly files: PrivateFilesService,
  ) {}

  @Get('deliveries')
  list(@CurrentUser() u: AuthUser) {
    return this.deliveries.driverList(u);
  }

  @Get('deliveries/:orderId')
  detail(@Param('orderId', uuid) orderId: string, @CurrentUser() u: AuthUser) {
    return this.deliveries.driverDetail(orderId, u);
  }

  @Post('deliveries/:orderId/start')
  @HttpCode(200)
  start(@Param('orderId', uuid) orderId: string, @Body(new ZodPipe(driverStartSchema)) body: DriverStartInput, @CurrentUser() u: AuthUser) {
    return this.deliveries.start(orderId, body, u);
  }

  @Post('deliveries/:orderId/deliver')
  @HttpCode(200)
  deliver(@Param('orderId', uuid) orderId: string, @Body(new ZodPipe(driverDeliverSchema)) body: DriverDeliverInput, @CurrentUser() u: AuthUser) {
    return this.deliveries.deliver(orderId, body, u);
  }

  @Post('deliveries/:orderId/fail')
  @HttpCode(200)
  fail(@Param('orderId', uuid) orderId: string, @Body(new ZodPipe(driverFailSchema)) body: DriverFailInput, @CurrentUser() u: AuthUser) {
    return this.deliveries.fail(orderId, body, u);
  }

  /** Topshirish surati — yopiq fayl, keyin /deliver ga proofUploadId bilan */
  @Post('uploads/proof')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 } }))
  proof(@CurrentUser() u: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new AppException('FILE_REQUIRED', '"file" maydoni bo\'sh', HttpStatus.UNPROCESSABLE_ENTITY);
    return this.files.save(u.id, DELIVERY_PROOF_PURPOSE, file.buffer);
  }
}
