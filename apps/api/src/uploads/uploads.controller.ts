import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Controller, HttpStatus, Inject, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppException } from '../common/app-exception.js';
import { ENV, type Env } from '../config/env.js';
import { Roles } from '../auth/decorators.js';
import { detectFileType } from './private-files.service.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['jpg', 'png', 'webp']);

/**
 * Katalog rasmlari (ochiq). Mijoz cheklari va chat fayllari — PrivateFilesService (yopiq).
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
    const ext = detectFileType(file.buffer);
    if (!ext || !IMAGE_TYPES.has(ext)) {
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
