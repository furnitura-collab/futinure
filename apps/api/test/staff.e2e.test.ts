import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDb, type TestContext } from './app.js';
import { userWithToken } from './fixtures.js';

const PHONE = '+998901112233';
const PASSWORD = 'staff-pass-1';

describe('xodimlar va parol (e2e)', () => {
  let ctx: TestContext;
  let admin: Awaited<ReturnType<typeof userWithToken>>;

  const loginPw = (phone: string, password: string) => ctx.http.post('/api/v1/auth/login').send({ phone, password });
  const refresh = (refreshToken: string) => ctx.http.post('/api/v1/auth/refresh').send({ refreshToken });
  const createStaff = (body: object) => ctx.http.post('/api/v1/admin/staff').set(admin.auth).send(body);
  const patchStaff = (id: string, body: object) => ctx.http.patch(`/api/v1/admin/staff/${id}`).set(admin.auth).send(body);

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx);
    admin = await userWithToken(ctx, 'SUPER_ADMIN');
  });

  describe('/admin/staff', () => {
    it('faqat super admin', async () => {
      const manager = await userWithToken(ctx, 'MANAGER');
      const customer = await userWithToken(ctx, 'CUSTOMER');
      await ctx.http.get('/api/v1/admin/staff').set(manager.auth).expect(403);
      await ctx.http.get('/api/v1/admin/staff').set(customer.auth).expect(403);
      await ctx.http.post('/api/v1/admin/staff').set(manager.auth).send({}).expect(403);
      await ctx.http.get('/api/v1/admin/staff').expect(401);
    });

    it('ro\'yxatda faqat xodimlar, mijozlar va xesh yo\'q', async () => {
      await userWithToken(ctx, 'CUSTOMER');
      const driver = await userWithToken(ctx, 'DRIVER');
      const res = await ctx.http.get('/api/v1/admin/staff').set(admin.auth).expect(200);
      expect(res.body.map((u: { id: string }) => u.id).sort()).toEqual([admin.user.id, driver.user.id].sort());
      expect(Object.keys(res.body[0]).sort()).toEqual(['createdAt', 'fullName', 'id', 'isActive', 'lastLoginAt', 'phone', 'role']);
    });

    it('yaratilgan xodim shu parol bilan kiradi, audit yoziladi', async () => {
      const res = await createStaff({ phone: '90 111-22-33', fullName: 'Omborchi Ali', role: 'WAREHOUSE', password: PASSWORD }).expect(201);
      expect(res.body).toMatchObject({ phone: PHONE, fullName: 'Omborchi Ali', role: 'WAREHOUSE', isActive: true, lastLoginAt: null });
      expect(res.body.passwordHash).toBeUndefined();

      const login = await loginPw(PHONE, PASSWORD).expect(200);
      expect(login.body.user).toMatchObject({ id: res.body.id, role: 'WAREHOUSE' });

      const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entity: 'staff', entityId: res.body.id } });
      expect(audit).toMatchObject({ actorId: admin.user.id, action: 'create' });
      expect(JSON.stringify(audit.after)).not.toContain(PASSWORD);
    });

    it('band raqam → 409 PHONE_TAKEN (mijoz raqami ham)', async () => {
      const customer = await userWithToken(ctx, 'CUSTOMER');
      const res = await createStaff({ phone: customer.user.phone, fullName: 'Ali Valiyev', role: 'MANAGER', password: PASSWORD }).expect(409);
      expect(res.body.error.code).toBe('PHONE_TAKEN');
    });

    it('validatsiya: CUSTOMER roli va qisqa parol → 422', async () => {
      await createStaff({ phone: PHONE, fullName: 'Ali Valiyev', role: 'CUSTOMER', password: PASSWORD }).expect(422);
      await createStaff({ phone: PHONE, fullName: 'Ali Valiyev', role: 'MANAGER', password: '123' }).expect(422);
    });

    it('ism va rolni tahrirlash', async () => {
      const m = await userWithToken(ctx, 'MANAGER');
      const res = await patchStaff(m.user.id, { fullName: 'Yangi Ism', role: 'WAREHOUSE' }).expect(200);
      expect(res.body).toMatchObject({ id: m.user.id, fullName: 'Yangi Ism', role: 'WAREHOUSE' });
    });

    it('mijozni yoki yo\'q id ni tahrirlab bo\'lmaydi → 404', async () => {
      const customer = await userWithToken(ctx, 'CUSTOMER');
      await patchStaff(customer.user.id, { fullName: 'Xodim emas' }).expect(404);
      await patchStaff('019a0000-0000-7000-8000-000000000000', { fullName: 'Hech kim' }).expect(404);
      await patchStaff('not-a-uuid', { fullName: 'Hech kim' }).expect(400);
    });

    it('parol almashtirilsa — eski parol ishlamaydi, sessiyalar yopiladi', async () => {
      const created = await createStaff({ phone: PHONE, fullName: 'Ali Valiyev', role: 'MANAGER', password: PASSWORD }).expect(201);
      const { refreshToken } = (await loginPw(PHONE, PASSWORD).expect(200)).body;

      await patchStaff(created.body.id, { password: 'new-pass-2' }).expect(200);
      await loginPw(PHONE, PASSWORD).expect(401);
      await refresh(refreshToken).expect(401);
      await loginPw(PHONE, 'new-pass-2').expect(200);
    });

    it('bloklash sessiyalarni yopadi va kirishni to\'xtatadi; qayta faollashtirish', async () => {
      const created = await createStaff({ phone: PHONE, fullName: 'Ali Valiyev', role: 'MANAGER', password: PASSWORD }).expect(201);
      const { refreshToken } = (await loginPw(PHONE, PASSWORD).expect(200)).body;

      await patchStaff(created.body.id, { isActive: false }).expect(200);
      await refresh(refreshToken).expect(401);
      await loginPw(PHONE, PASSWORD).expect(403);

      await patchStaff(created.body.id, { isActive: true }).expect(200);
      await loginPw(PHONE, PASSWORD).expect(200);
    });

    it('ism o\'zgarsa sessiyalar yopilmaydi', async () => {
      const m = await userWithToken(ctx, 'MANAGER');
      await patchStaff(m.user.id, { fullName: 'Boshqa Ism' }).expect(200);
      await refresh(m.refreshToken).expect(200);
    });

    it('super admin o\'zini bloklay yoki pasaytira olmaydi → 400 CANNOT_MODIFY_SELF', async () => {
      for (const body of [{ isActive: false }, { role: 'MANAGER' }]) {
        const res = await patchStaff(admin.user.id, body).expect(400);
        expect(res.body.error.code).toBe('CANNOT_MODIFY_SELF');
      }
      const res = await patchStaff(admin.user.id, { fullName: 'Bosh Admin', role: 'SUPER_ADMIN', isActive: true }).expect(200);
      expect(res.body).toMatchObject({ fullName: 'Bosh Admin', role: 'SUPER_ADMIN', isActive: true });
    });

    it('boshqa super adminni pasaytirish mumkin', async () => {
      const other = await userWithToken(ctx, 'SUPER_ADMIN');
      await patchStaff(other.user.id, { role: 'MANAGER' }).expect(200);
    });
  });

  describe('POST /me/password', () => {
    const change = (auth: object, body: object) => ctx.http.post('/api/v1/me/password').set(auth).send(body);

    it('joriy parol tekshiriladi; boshqa sessiyalar yopiladi, joriysi qoladi', async () => {
      await createStaff({ phone: PHONE, fullName: 'Ali Valiyev', role: 'MANAGER', password: PASSWORD }).expect(201);
      const current = (await loginPw(PHONE, PASSWORD).expect(200)).body;
      const other = (await loginPw(PHONE, PASSWORD).expect(200)).body;
      const auth = { Authorization: `Bearer ${current.accessToken}` };

      expect((await change(auth, { newPassword: 'new-pass-2' }).expect(401)).body.error.code).toBe('INVALID_PASSWORD');
      expect((await change(auth, { currentPassword: 'wrong-pass', newPassword: 'new-pass-2' }).expect(401)).body.error.code).toBe(
        'INVALID_PASSWORD',
      );

      await change(auth, { currentPassword: PASSWORD, newPassword: 'new-pass-2' }).expect(204);
      await refresh(other.refreshToken).expect(401);
      await refresh(current.refreshToken).expect(200);
      await loginPw(PHONE, PASSWORD).expect(401);
      await loginPw(PHONE, 'new-pass-2').expect(200);
    });

    it('paroli yo\'q foydalanuvchi joriy parolsiz o\'rnatadi', async () => {
      const customer = await userWithToken(ctx, 'CUSTOMER');
      await change(customer.auth, { newPassword: 'first-pass' }).expect(204);
      await loginPw(customer.user.phone, 'first-pass').expect(200);
    });

    it('qisqa yangi parol → 422; tokensiz → 401', async () => {
      const customer = await userWithToken(ctx, 'CUSTOMER');
      await change(customer.auth, { newPassword: '123' }).expect(422);
      await ctx.http.post('/api/v1/me/password').send({ newPassword: 'first-pass' }).expect(401);
    });
  });
});
