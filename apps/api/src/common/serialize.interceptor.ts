import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor, StreamableFile } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { Prisma } from '../generated/prisma/client.js';

/**
 * JSON'ga chiqarishdan oldin:
 * - BigInt (pul) → number. 9e15 so'mgacha aniq.
 * - Decimal (miqdor) → string ("12.5"), float xatolari bo'lmasin.
 */
export function serialize(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  // Fayllar (chek) o'zgarishsiz o'tadi
  if (value instanceof StreamableFile || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(serialize);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
  return out;
}

@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(serialize));
  }
}
