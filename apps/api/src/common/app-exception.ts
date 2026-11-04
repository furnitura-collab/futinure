import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Barcha biznes xatolari shu orqali. Mijoz `code` bo'yicha tarjima qiladi,
 * `message` — dasturchi uchun.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }

  static notFound(entity: string) {
    return new AppException('NOT_FOUND', `${entity} topilmadi`, HttpStatus.NOT_FOUND);
  }

  static unauthorized(code = 'UNAUTHORIZED', message = 'Avtorizatsiya kerak') {
    return new AppException(code, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(message = 'Ruxsat yo\'q') {
    return new AppException('FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }
}
