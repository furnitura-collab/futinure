import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { deviceTokenSchema, updateMeSchema, type DeviceTokenInput, type UpdateMe } from '@mebel/shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { type AuthUser, CurrentUser } from '../auth/decorators.js';
import { MeService } from './me.service.js';

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.me.get(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body(new ZodPipe(updateMeSchema)) body: UpdateMe) {
    return this.me.update(user, body);
  }

  @Post('devices')
  @HttpCode(204)
  async addDevice(@CurrentUser() user: AuthUser, @Body(new ZodPipe(deviceTokenSchema)) body: DeviceTokenInput) {
    await this.me.addDevice(user.id, body);
  }

  @Delete('devices/:token')
  @HttpCode(204)
  async removeDevice(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    await this.me.removeDevice(user.id, token);
  }
}
