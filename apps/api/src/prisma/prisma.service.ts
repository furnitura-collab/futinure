import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { ENV, type Env } from '../config/env.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    // Parol xeshi hech qachon javobga tushmasin — kerak joyda `omit: { passwordHash: false }`
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }), omit: { user: { passwordHash: true } } });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
