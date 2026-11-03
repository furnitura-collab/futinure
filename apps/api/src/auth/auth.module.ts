import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ENV, type Env } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { OtpService } from './otp.service.js';
import { ConsoleSmsSender, EskizSmsSender, SmsSender } from './sms.sender.js';
import { TokenService } from './token.service.js';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: { expiresIn: env.JWT_ACCESS_TTL as `${number}m` },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    {
      provide: SmsSender,
      inject: [ENV, ConsoleSmsSender, EskizSmsSender],
      useFactory: (env: Env, console: ConsoleSmsSender, eskiz: EskizSmsSender) =>
        env.SMS_PROVIDER === 'eskiz' ? eskiz : console,
    },
    ConsoleSmsSender,
    EskizSmsSender,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [TokenService, JwtModule],
})
export class AuthModule {}
