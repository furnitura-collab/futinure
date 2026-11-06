import asyncio
from datetime import timedelta

from sqlalchemy import select, update

from app.auth.otp import OTP_MAX_ATTEMPTS
from app.models import CustomerProfile, OtpCode, RefreshSession, User, utcnow
from tests.support import Ctx, assert_matches, login

PHONE = "+998912345678"
PASSWORD = "secret123"


async def otp_request(ctx: Ctx, phone: str):
    return await ctx.http.post("/api/v1/auth/otp/request", json={"phone": phone})


async def otp_verify(ctx: Ctx, phone: str, code: str):
    return await ctx.http.post("/api/v1/auth/otp/verify", json={"phone": phone, "code": code})


async def login_pw(ctx: Ctx, phone: str, password: str):
    return await ctx.http.post("/api/v1/auth/login", json={"phone": phone, "password": password})


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ───────────────────────── OTP ─────────────────────────


async def test_invalid_phone_422(ctx: Ctx):
    res = await otp_request(ctx, "123")
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_phone_normalized_and_customer_created(ctx: Ctx):
    assert (await otp_request(ctx, "90 123-45-67")).status_code == 200
    assert ctx.sms.sent[0]["phone"] == "+998901234567"

    res = await otp_verify(ctx, "+998901234567", ctx.sms.last_code("+998901234567"))
    assert res.status_code == 200
    assert res.json()["isNew"] is True
    assert res.json()["user"]["role"] == "CUSTOMER"
    assert await ctx.db.get(CustomerProfile, res.json()["user"]["id"]) is not None


async def test_second_code_within_minute_429(ctx: Ctx):
    assert (await otp_request(ctx, PHONE)).status_code == 200
    res = await otp_request(ctx, PHONE)
    assert res.status_code == 429
    assert res.json()["error"]["code"] == "OTP_RATE_LIMIT"
    assert len(ctx.sms.sent) == 1


async def test_test_phone_no_sms_fixed_code_no_limit(ctx: Ctx):
    for _ in range(3):
        assert (await otp_request(ctx, "+998900000001")).status_code == 200
    assert ctx.sms.sent == []
    assert (await otp_verify(ctx, "+998900000001", "000000")).status_code == 200


async def test_wrong_code_attempts_limited_then_correct_blocked(ctx: Ctx):
    await otp_request(ctx, PHONE)
    code = ctx.sms.last_code(PHONE)
    wrong = "000002" if code == "000001" else "000001"

    for i in range(OTP_MAX_ATTEMPTS):
        res = await otp_verify(ctx, PHONE, wrong)
        assert res.status_code == 400
        assert res.json()["error"]["details"]["attemptsLeft"] == OTP_MAX_ATTEMPTS - i - 1
    res = await otp_verify(ctx, PHONE, code)
    assert res.status_code == 429
    assert res.json()["error"]["code"] == "OTP_TOO_MANY_ATTEMPTS"


async def test_code_used_once(ctx: Ctx):
    await otp_request(ctx, PHONE)
    code = ctx.sms.last_code(PHONE)
    assert (await otp_verify(ctx, PHONE, code)).status_code == 200
    assert (await otp_verify(ctx, PHONE, code)).status_code == 400


async def test_expired_code_rejected(ctx: Ctx):
    await otp_request(ctx, PHONE)
    await ctx.db.execute(update(OtpCode).values(expires_at=utcnow() - timedelta(seconds=1)))
    await ctx.db.commit()
    res = await otp_verify(ctx, PHONE, ctx.sms.last_code(PHONE))
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "OTP_EXPIRED"


async def test_blocked_user_cannot_login(ctx: Ctx):
    await ctx.add(User(phone=PHONE, is_active=False))
    await otp_request(ctx, PHONE)
    assert (await otp_verify(ctx, PHONE, ctx.sms.last_code(PHONE))).status_code == 403


# ───────────────────────── Parol bilan kirish ─────────────────────────


async def test_password_new_number_registers_then_logs_in(ctx: Ctx):
    res = await login_pw(ctx, "90 123-45-67", PASSWORD)
    assert res.status_code == 200
    assert_matches(res.json(), {"isNew": True, "user": {"phone": "+998901234567", "role": "CUSTOMER"}})
    assert "passwordHash" not in res.json()["user"]
    assert await ctx.db.get(CustomerProfile, res.json()["user"]["id"]) is not None
    assert (await login_pw(ctx, "+998901234567", PASSWORD)).status_code == 200


async def test_password_wrong_401(ctx: Ctx):
    assert (await login_pw(ctx, PHONE, PASSWORD)).status_code == 200
    res = await login_pw(ctx, PHONE, "wrong-pass")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "INVALID_PASSWORD"


async def test_password_customer_without_password_sets_it(ctx: Ctx):
    user = User(phone=PHONE, role="CUSTOMER")
    await ctx.add(user)
    await ctx.add(CustomerProfile(user_id=user.id))
    res = await login_pw(ctx, PHONE, PASSWORD)
    assert res.status_code == 200
    assert res.json()["user"]["role"] == "CUSTOMER"
    assert (await login_pw(ctx, PHONE, "other-pass")).status_code == 401


async def test_password_staff_cannot_set_own_password(ctx: Ctx):
    await ctx.add(User(phone=PHONE, role="MANAGER"))
    res = await login_pw(ctx, PHONE, PASSWORD)
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "PASSWORD_NOT_SET"
    user = await ctx.first(select(User).where(User.phone == PHONE))
    assert user.password_hash is None
    assert await ctx.count(RefreshSession) == 0


async def test_password_too_short_422(ctx: Ctx):
    assert (await login_pw(ctx, PHONE, "123")).status_code == 422


async def test_password_blocked_after_many_failures(ctx: Ctx):
    assert (await login_pw(ctx, PHONE, PASSWORD)).status_code == 200
    for _ in range(10):
        assert (await login_pw(ctx, PHONE, "wrong-pass")).status_code == 401
    res = await login_pw(ctx, PHONE, PASSWORD)
    assert res.status_code == 429
    assert res.json()["error"]["code"] == "LOGIN_RATE_LIMIT"


async def test_password_hash_not_in_me(ctx: Ctx):
    body = (await login_pw(ctx, PHONE, PASSWORD)).json()
    me = await ctx.http.get("/api/v1/me", headers=bearer(body["accessToken"]))
    assert me.status_code == 200
    assert "passwordHash" not in me.json()


# ───────────────────────── Refresh token ─────────────────────────


async def test_refresh_rotation(ctx: Ctx):
    rt = (await login(ctx, PHONE))["refreshToken"]
    res = await ctx.http.post("/api/v1/auth/refresh", json={"refreshToken": rt})
    assert res.status_code == 200
    assert res.json()["refreshToken"] != rt
    assert res.json()["accessToken"]


async def test_refresh_reuse_revokes_family(ctx: Ctx):
    rt1 = (await login(ctx, PHONE))["refreshToken"]
    r2 = await ctx.http.post("/api/v1/auth/refresh", json={"refreshToken": rt1})
    assert r2.status_code == 200
    assert (await ctx.http.post("/api/v1/auth/refresh", json={"refreshToken": rt1})).status_code == 401
    assert (await ctx.http.post("/api/v1/auth/refresh", json={"refreshToken": r2.json()["refreshToken"]})).status_code == 401


async def test_refresh_concurrent_only_one_wins(ctx: Ctx):
    rt = (await login(ctx, PHONE))["refreshToken"]
    results = await asyncio.gather(
        ctx.http.post("/api/v1/auth/refresh", json={"refreshToken": rt}),
        ctx.http.post("/api/v1/auth/refresh", json={"refreshToken": rt}),
    )
    assert sorted(r.status_code for r in results) == [200, 401]


async def test_refresh_after_logout_fails(ctx: Ctx):
    rt = (await login(ctx, PHONE))["refreshToken"]
    assert (await ctx.http.post("/api/v1/auth/logout", json={"refreshToken": rt})).status_code == 204
    assert (await ctx.http.post("/api/v1/auth/refresh", json={"refreshToken": rt})).status_code == 401


# ───────────────────────── /me ─────────────────────────


async def test_me_requires_valid_token(ctx: Ctx):
    assert (await ctx.http.get("/api/v1/me")).status_code == 401
    assert (await ctx.http.get("/api/v1/me", headers=bearer("abc.def.ghi"))).status_code == 401


async def test_me_update_profile(ctx: Ctx):
    token = (await login(ctx, PHONE))["accessToken"]
    res = await ctx.http.patch(
        "/api/v1/me",
        headers=bearer(token),
        json={"fullName": "Aziz usta", "customerType": "COMPANY", "companyName": "Aziz Mebel MChJ", "inn": "123456789"},
    )
    assert res.status_code == 200
    assert_matches(
        res.json(),
        {
            "fullName": "Aziz usta",
            "customerProfile": {"type": "COMPANY", "companyName": "Aziz Mebel MChJ", "inn": "123456789", "balanceCached": 0},
        },
    )


async def test_me_inn_must_be_9_digits(ctx: Ctx):
    token = (await login(ctx, PHONE))["accessToken"]
    assert (await ctx.http.patch("/api/v1/me", headers=bearer(token), json={"inn": "12345"})).status_code == 422


async def test_me_staff_cannot_change_customer_fields(ctx: Ctx):
    await ctx.add(User(phone=PHONE, role="MANAGER"))
    body = await login(ctx, PHONE)
    assert body["user"]["role"] == "MANAGER"
    res = await ctx.http.patch("/api/v1/me", headers=bearer(body["accessToken"]), json={"customerType": "MASTER"})
    assert res.status_code == 403
