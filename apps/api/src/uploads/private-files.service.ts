import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppException } from '../common/app-exception.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
export const RECEIPT_PURPOSE = 'RECEIPT';

const TYPES = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
} as const;

/** Kengaytmaga emas, fayl boshidagi baytlarga qaraymiz */
export function detectFileType(buf: Buffer): keyof typeof TYPES | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 0, 5) === '%PDF-') return 'pdf';
  return null;
}

/**
 * Yopiq fayllar (to'lov cheklari). UPLOAD_DIR/private ostida, statik berilmaydi.
 * Production'da S3 private bucket + qisqa muddatli imzolangan havola bilan almashtiriladi.
 */
@Injectable()
export class PrivateFilesService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  async save(ownerId: string, purpose: string, buffer: Buffer) {
    const ext = detectFileType(buffer);
    if (!ext) {
      throw new AppException('UNSUPPORTED_FILE', 'Faqat JPG, PNG, WEBP rasm yoki PDF', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }
    const month = new Date().toISOString().slice(0, 7);
    const relative = join(purpose.toLowerCase(), month, `${randomUUID()}.${ext}`);
    const absolute = this.absolute(relative);
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, buffer);
    return this.prisma.upload.create({
      data: { ownerId, purpose, storagePath: relative, mimeType: TYPES[ext], size: buffer.length },
      select: { id: true, mimeType: true, size: true, createdAt: true },
    });
  }

  open(upload: { storagePath: string }) {
    return createReadStream(this.absolute(upload.storagePath));
  }

  private absolute(relative: string) {
    return resolve(this.env.UPLOAD_DIR, 'private', relative);
  }
}
