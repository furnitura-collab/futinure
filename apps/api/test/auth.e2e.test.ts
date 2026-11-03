import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OTP_MAX_ATTEMPTS } from '../src/auth/otp.service.js';
import { createTestApp, login, resetDb, type TestContext } from './app.js';

const PHONE = '+998912345678';

describe('auth (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx);
  });

  it('noto\'g\'ri raqam → 422', async () => {
    const res = await ctx.http.post('/api/v1/auth/otp/request').send({ phone: '123' }).expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('raqam normallashtiriladi va yangi mijoz yaratiladi', async () => {
    await ctx.http.post('/api/v1/auth/otp/request').send({ phone: '90 123-45-67' }).expect(200);
    expect(ctx.sms.sent[0]?.phone).toBe('+998901234567');

    const res = await ctx.http
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+998901234567', code: ctx.sms.lastCode('+998901234567') })
      .expect(200);
    expect(res.body.isNew).toBe(true);
    expect(res.body.user.role).toBe('CUSTOMER');

    const profile = await ctx.prisma.customerProfile.findUnique({ where: { userId: res.body.user.id } });
    expect(profile).not.toBeNull();
  });

  it('1 daqiqada ikkinchi kod so\'ralsa 429', async () => {
    await ctx.http.post('/api/v1/auth/otp/request').send({ phone: PHONE }).expect(200);
    const res = await ctx.http.post('/api/v1/auth/otp/request').send({ phone: PHONE }).expect(429);
    expect(res.body.error.code).toBe('OTP_RATE_LIMIT');
    expect(ctx.sms.sent).toHaveLength(1);
  });

  it('test raqamga SMS ketmaydi, kod 000000, limit yo\'q', async () => {
    for (let i = 0; i < 3; i++) {
      await ctx.http.post('/api/v1/auth/otp/request').send({ phone: '+998900000001' }).expect(200);
    }
    expect(ctx.sms.sent).toHaveLength(0);
    await ctx.http.post('/api/v1/auth/otp/verify').send({ phone: '+998900000001', code: '000000' }).expect(200);
  });

  it('xato kod urinishlari cheklangan, to\'g\'ri kod ham bloklanadi', async () => {
    await ctx.http.post('/api/v1/auth/otp/request').send({ phone: PHONE }).expect(200);
    const code = ctx.sms.lastCode(PHONE);
    const wrong = code === '000001' ? '000002' : '000001';

    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      const res = await ctx.http.post('/api/v1/auth/otp/verify').send({ phone: PHONE, code: wrong }).expect(400);
      expect(res.body.error.details.attemptsLeft).toBe(OTP_MAX_ATTEMPTS - i - 1);
    }
    const res = await ctx.http.post('/api/v1/auth/otp/verify').send({ phone: PHONE, code }).expect(429);
    expect(res.body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('kod bir marta ishlatiladi', async () => {
    await ctx.http.post('/api/v1/auth/otp/request').send({ phone: PHONE }).expect(200);
    const code = ctx.sms.lastCode(PHONE);
    await ctx.http.post('/api/v1/auth/otp/verify').send({ phone: PHONE, code }).expect(200);
    await ctx.http.post('/api/v1/auth/otp/verify').send({ phone: PHONE, code }).expect(400);
  });

  it('muddati o\'tgan kod qabul qilinmaydi', async () => {
    await ctx.http.post('/api/v1/auth/otp/request').send({ phone: PHONE }).expect(200);
    await ctx.prisma.otpCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await ctx.http
      .post('/api/v1/auth/otp/verify')
      .send({ phone: PHONE, code: ctx.sms.lastCode(PHONE) })
      .expect(400);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });

  it('bloklangan foydalanuvchi kira olmaydi', async () => {
    await ctx.prisma.user.create({ data: { phone: PHONE, isActive: false } });
    await ctx.http.post('/api/v1/auth/otp/request').send({ phone: PHONE }).expect(200);
    await ctx.http
      .post('/api/v1/auth/otp/verify')
      .send({ phone: PHONE, code: ctx.sms.lastCode(PHONE) })
      .expect(403);
  });

  describe('refresh token', () => {
    it('rotatsiya: yangi juftlik beriladi, eskisi bekor', async () => {
      const { refreshToken } = await login(ctx, PHONE);
      const res = await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken }).expect(200);
      expect(res.body.refreshToken).not.toBe(refreshToken);
      expect(res.body.accessToken).toBeTruthy();
    });

    it('eski token qayta ishlatilsa butun oila bekor qilinadi', async () => {
      const { refreshToken: rt1 } = await login(ctx, PHONE);
      const r2 = await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: rt1 }).expect(200);

      await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: rt1 }).expect(401);
      await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: r2.body.refreshToken }).expect(401);
    });

    it('bir vaqtdagi ikki refresh — faqat bittasi o\'tadi', async () => {
      const { refreshToken } = await login(ctx, PHONE);
      const results = await Promise.all([
        ctx.http.post('/api/v1/auth/refresh').send({ refreshToken }),
        ctx.http.post('/api/v1/auth/refresh').send({ refreshToken }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('logout\'dan keyin refresh ishlamaydi', async () => {
      const { refreshToken } = await login(ctx, PHONE);
      await ctx.http.post('/api/v1/auth/logout').send({ refreshToken }).expect(204);
      await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    });
  });

  describe('/me', () => {
    it('tokensiz 401, buzilgan token bilan 401', async () => {
      await ctx.http.get('/api/v1/me').expect(401);
      await ctx.http.get('/api/v1/me').set('Authorization', 'Bearer abc.def.ghi').expect(401);
    });

    it('profilni yangilash', async () => {
      const { accessToken } = await login(ctx, PHONE);
      const res = await ctx.http
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fullName: 'Aziz usta', customerType: 'COMPANY', companyName: 'Aziz Mebel MChJ', inn: '123456789' })
        .expect(200);
      expect(res.body).toMatchObject({
        fullName: 'Aziz usta',
        customerProfile: { type: 'COMPANY', companyName: 'Aziz Mebel MChJ', inn: '123456789', balanceCached: 0 },
      });
    });

    it('STIR 9 raqam bo\'lishi kerak', async () => {
      const { accessToken } = await login(ctx, PHONE);
      await ctx.http
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ inn: '12345' })
        .expect(422);
    });

    it('xodim mijoz maydonlarini o\'zgartira olmaydi', async () => {
      await ctx.prisma.user.create({ data: { phone: PHONE, role: 'MANAGER' } });
      const { accessToken, user } = await login(ctx, PHONE);
      expect(user.role).toBe('MANAGER');
      await ctx.http
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ customerType: 'MASTER' })
        .expect(403);
    });
  });
});
