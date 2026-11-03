import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { AppException } from './app-exception.js';
import { serialize } from './serialize.interceptor.js';

/** Javob formati: { error: { code, message, details? } } */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toResponse(exception);
    if (status >= 500) this.logger.error(exception);
    res.status(status).json({ error: body });
  }

  private toResponse(e: unknown): { status: number; body: { code: string; message: string; details?: unknown } } {
    if (e instanceof AppException) {
      // details ichida BigInt/Decimal bo'lishi mumkin
      return { status: e.getStatus(), body: { code: e.code, message: e.message, details: serialize(e.details) } };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      return { status, body: { code: HttpStatus[status] ?? 'HTTP_ERROR', message: e.message } };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return { status: 409, body: { code: 'CONFLICT', message: 'Bunday yozuv allaqachon mavjud' } };
      if (e.code === 'P2025') return { status: 404, body: { code: 'NOT_FOUND', message: 'Yozuv topilmadi' } };
    }
    return { status: 500, body: { code: 'INTERNAL', message: 'Ichki xatolik' } };
  }
}
