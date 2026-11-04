import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  adminCustomerListQuerySchema,
  adminCustomerUpdateSchema,
  adminPaymentSchema,
  customerPaymentSchema,
  ledgerAdjustSchema,
  ledgerQuerySchema,
  paginationSchema,
  paymentListQuerySchema,
  periodQuerySchema,
  refundSchema,
  rejectPaymentSchema,
  type AdminCustomerListQuery,
  type AdminCustomerUpdate,
  type AdminPaymentInput,
  type CustomerPaymentInput,
  type LedgerAdjustInput,
  type LedgerQuery,
  type PaymentListQuery,
  type PeriodQuery,
  type RefundInput,
  type RejectPaymentInput,
} from '@mebel/shared';
import { AppException } from '../common/app-exception.js';
import type { PageQuery } from '../common/pagination.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { type AuthUser, CurrentUser, Public, Roles } from '../auth/decorators.js';
import { AdminCustomersService } from '../customers/admin-customers.service.js';
import { CustomerFinanceService } from '../customers/customer-finance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MAX_RECEIPT_BYTES, PrivateFilesService, RECEIPT_PURPOSE } from '../uploads/private-files.service.js';
import { PaymentsService } from './payments.service.js';

const uuid = new ParseUUIDPipe();

// ───────────── Mijoz ─────────────

@Roles('CUSTOMER')
@Controller()
export class CustomerPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly finance: CustomerFinanceService,
    private readonly files: PrivateFilesService,
  ) {}

  /** Chek: avval yuklanadi, keyin to'lovga uploadId bilan biriktiriladi */
  @Post('uploads/receipts')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 } }))
  uploadReceipt(@CurrentUser() u: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new AppException('FILE_REQUIRED', '"file" maydoni bo\'sh', HttpStatus.UNPROCESSABLE_ENTITY);
    return this.files.save(u.id, RECEIPT_PURPOSE, file.buffer);
  }

  @Post('orders/:id/payments')
  payOrder(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(customerPaymentSchema)) body: CustomerPaymentInput) {
    return this.payments.reportForOrder(u, id, body);
  }

  @Post('me/payments')
  payDebt(@CurrentUser() u: AuthUser, @Body(new ZodPipe(customerPaymentSchema)) body: CustomerPaymentInput) {
    return this.payments.reportForDebt(u, body);
  }

  @Get('me/payments')
  myPayments(@CurrentUser() u: AuthUser, @Query(new ZodPipe(paginationSchema)) q: PageQuery) {
    return this.payments.customerPayments(u.id, q.page, q.limit);
  }

  @Get('me/balance')
  balance(@CurrentUser() u: AuthUser) {
    return this.finance.balance(u.id);
  }

  @Get('me/ledger')
  ledger(@CurrentUser() u: AuthUser, @Query(new ZodPipe(ledgerQuerySchema)) q: LedgerQuery) {
    return this.finance.ledger(u.id, q);
  }

  @Get('me/reconciliation')
  reconciliation(@CurrentUser() u: AuthUser, @Query(new ZodPipe(periodQuerySchema)) q: PeriodQuery) {
    return this.finance.reconciliation(u.id, q);
  }
}

@Controller()
export class PaymentReceiptController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly files: PrivateFilesService,
    private readonly prisma: PrismaService,
  ) {}

  /** Karta raqami va bank rekvizitlari — o'tkazma qilish uchun */
  @Public()
  @Get('payment-info')
  async paymentInfo() {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: ['payment.card', 'payment.bank'] } } });
    const get = (k: string) => rows.find((r) => r.key === k)?.value ?? null;
    return { card: get('payment.card'), bank: get('payment.bank') };
  }

  @Roles('CUSTOMER', 'MANAGER', 'SUPER_ADMIN')
  @Get('payments/:id/receipt')
  async receipt(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser, @Res({ passthrough: true }) res: Response) {
    const file = await this.payments.receiptFor(id, u);
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    // Turi StreamableFile orqali — express res.set() binar faylga ham charset qo'shib yuboradi
    return new StreamableFile(this.files.open(file), { type: file.mimeType, disposition: 'inline' });
  }
}

// ───────────── Admin ─────────────

@Roles('MANAGER', 'SUPER_ADMIN')
@Controller('admin')
export class AdminPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly customers: AdminCustomersService,
    private readonly finance: CustomerFinanceService,
  ) {}

  @Get('payments')
  list(@Query(new ZodPipe(paymentListQuerySchema)) q: PaymentListQuery) {
    return this.payments.list(q);
  }

  @Get('payments/:id')
  get(@Param('id', uuid) id: string) {
    return this.payments.get(id);
  }

  @Post('payments')
  record(@Body(new ZodPipe(adminPaymentSchema)) body: AdminPaymentInput, @CurrentUser() u: AuthUser) {
    return this.payments.record(body, u);
  }

  @Post('payments/:id/confirm')
  @HttpCode(200)
  confirm(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser) {
    return this.payments.confirm(id, u);
  }

  @Post('payments/:id/reject')
  @HttpCode(200)
  reject(@Param('id', uuid) id: string, @Body(new ZodPipe(rejectPaymentSchema)) body: RejectPaymentInput, @CurrentUser() u: AuthUser) {
    return this.payments.reject(id, body.reason, u);
  }

  @Get('customers')
  customerList(@Query(new ZodPipe(adminCustomerListQuerySchema)) q: AdminCustomerListQuery) {
    return this.customers.list(q);
  }

  @Get('customers/:id')
  customer(@Param('id', uuid) id: string) {
    return this.customers.detail(id);
  }

  @Patch('customers/:id')
  updateCustomer(@Param('id', uuid) id: string, @Body(new ZodPipe(adminCustomerUpdateSchema)) body: AdminCustomerUpdate, @CurrentUser() u: AuthUser) {
    return this.customers.update(id, body, u);
  }

  @Get('customers/:id/ledger')
  customerLedger(@Param('id', uuid) id: string, @Query(new ZodPipe(ledgerQuerySchema)) q: LedgerQuery) {
    return this.finance.ledger(id, q);
  }

  @Get('customers/:id/reconciliation')
  customerReconciliation(@Param('id', uuid) id: string, @Query(new ZodPipe(periodQuerySchema)) q: PeriodQuery) {
    return this.finance.reconciliation(id, q);
  }

  @Roles('SUPER_ADMIN')
  @Post('customers/:id/ledger/adjust')
  adjust(@Param('id', uuid) id: string, @Body(new ZodPipe(ledgerAdjustSchema)) body: LedgerAdjustInput, @CurrentUser() u: AuthUser) {
    return this.customers.adjust(id, body, u);
  }

  @Roles('SUPER_ADMIN')
  @Post('customers/:id/refunds')
  refund(@Param('id', uuid) id: string, @Body(new ZodPipe(refundSchema)) body: RefundInput, @CurrentUser() u: AuthUser) {
    return this.customers.refund(id, body, u);
  }

  @Get('reports/receivables')
  receivables() {
    return this.customers.receivables();
  }
}
