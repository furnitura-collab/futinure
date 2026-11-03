import { Body, Controller, HttpCode, Ip, Post, Headers } from '@nestjs/common';
import {
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  type OtpRequest,
  type OtpVerify,
  type RefreshInput,
} from '@mebel/shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { AuthService } from './auth.service.js';
import { Public } from './decorators.js';
import { OtpService } from './otp.service.js';
import { TokenService } from './token.service.js';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
  ) {}

  @Post('otp/request')
  @HttpCode(200)
  request(@Body(new ZodPipe(otpRequestSchema)) body: OtpRequest, @Ip() ip: string) {
    return this.otp.request(body.phone, ip);
  }

  @Post('otp/verify')
  @HttpCode(200)
  verify(@Body(new ZodPipe(otpVerifySchema)) body: OtpVerify, @Headers('user-agent') ua?: string) {
    return this.auth.verifyOtp(body.phone, body.code, ua);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodPipe(refreshSchema)) body: RefreshInput, @Headers('user-agent') ua?: string) {
    return this.tokens.rotate(body.refreshToken, ua);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodPipe(refreshSchema)) body: RefreshInput) {
    await this.tokens.revoke(body.refreshToken);
  }
}
