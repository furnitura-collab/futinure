import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppException } from './app-exception.js';

/** @Body(new ZodPipe(schema)) — sxemalar @mebel/shared dan, mobil va admin bilan bir xil */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppException(
        'VALIDATION_ERROR',
        'Ma\'lumotlar noto\'g\'ri',
        HttpStatus.UNPROCESSABLE_ENTITY,
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return result.data;
  }
}
