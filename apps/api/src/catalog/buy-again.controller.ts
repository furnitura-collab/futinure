import { Controller, Get } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../auth/decorators.js';
import { CatalogService } from './catalog.service.js';

/** Bosh sahifadagi "Yana buyurtma qilish" — oldin olingan tovarlar, oxirgi miqdori bilan */
@Roles('CUSTOMER')
@Controller('me')
export class BuyAgainController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('buy-again')
  list(@CurrentUser() u: AuthUser) {
    return this.catalog.buyAgain(u.id);
  }
}
