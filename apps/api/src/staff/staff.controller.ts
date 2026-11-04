import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { createStaffSchema, updateStaffSchema, type CreateStaff, type UpdateStaff } from '@mebel/shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { type AuthUser, CurrentUser, Roles } from '../auth/decorators.js';
import { StaffService } from './staff.service.js';

@Roles('SUPER_ADMIN')
@Controller('admin/staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list() {
    return this.staff.list();
  }

  @Post()
  create(@Body(new ZodPipe(createStaffSchema)) body: CreateStaff, @CurrentUser() u: AuthUser) {
    return this.staff.create(body, u);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodPipe(updateStaffSchema)) body: UpdateStaff, @CurrentUser() u: AuthUser) {
    return this.staff.update(id, body, u);
  }
}
