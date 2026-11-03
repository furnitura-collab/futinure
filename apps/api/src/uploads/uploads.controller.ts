import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  Controller,
  HttpStatus,
  Inject,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppException } from '../common/app-exception.js';
import { ENV, type Env } from '../config/env.js';
import { Roles } from '../auth/decorators.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Kengaytmaga emas, fayl boshidagi baytlarga qaraymiz */
function detectImage(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/**
 * Katalog rasmlari (ochiq). Mijoz cheklari keyingi qadamda alohida, yopiq saqlanadi.
 * Production'da S3'ga almashtiriladi — javob formati ({ url }) o'zgarmaydi.
 */
@Roles('MANAGER', 'SUPER_ADMIN')
@Controller('admin/uploads')
export class UploadsController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Post('images')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  async image(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new AppException('FILE_REQUIRED', '"file" maydoni bo\'sh', HttpStatus.UNPROCESSABLE_ENTITY);
    const ext = detectImage(file.buffer);
    if (!ext) {
      throw new AppException('UNSUPPORTED_FILE', 'Faqat JPG, PNG yoki WEBP rasm', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }
    const month = new Date().toISOString().slice(0, 7);
    const dir = join(this.env.UPLOAD_DIR, 'catalog', month);
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await writeFile(join(dir, name), file.buffer);
    return { url: `/uploads/catalog/${month}/${name}`, size: file.size };
  }
}
