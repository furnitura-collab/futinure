import { Controller, Global, HttpStatus, Module, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppException } from '../common/app-exception.js';
import { type AuthUser, CurrentUser, Roles } from '../auth/decorators.js';
import { CHAT_PURPOSE } from '../chat/chat.service.js';
import { MAX_RECEIPT_BYTES, PrivateFilesService } from './private-files.service.js';
import { UploadsController } from './uploads.controller.js';

@Roles('CUSTOMER', 'MANAGER', 'SUPER_ADMIN')
@Controller('uploads')
export class ChatUploadsController {
  constructor(private readonly files: PrivateFilesService) {}

  /** Chat ilovasi (rasm/PDF) — yopiq, faqat shu buyurtma ishtirokchilari ko'radi */
  @Post('chat')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 } }))
  chat(@CurrentUser() u: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new AppException('FILE_REQUIRED', '"file" maydoni bo\'sh', HttpStatus.UNPROCESSABLE_ENTITY);
    return this.files.save(u.id, CHAT_PURPOSE, file.buffer);
  }
}

@Global()
@Module({
  controllers: [UploadsController, ChatUploadsController],
  providers: [PrivateFilesService],
  exports: [PrivateFilesService],
})
export class UploadsModule {}
