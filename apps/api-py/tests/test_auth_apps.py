"""Kirish: har ilovaga faqat o'z rollari (app/auth/apps.py)"""

import pytest
from sqlalchemy import func, select

from app.auth.password import hash_password
from app.models import CustomerProfile, RefreshSession, User
from tests.support import Ctx

PHONE = "+998912223344"
PASSWORD = "secret123"


async def make_user(ctx: Ctx, role: str, password: str | None = PASSWORD) -> User:
    user = User(phone=PHONE, role=role, full_name=role, password_hash=await hash_password(password) if password else None)
    ctx.db.add(user)
    await ctx.db.flush()
    if role == "CUSTOMER":
        ctx.db.add(CustomerProfile(user_id=user.id))
    await ctx.db.commit()
    return user


async def login_pw(ctx: Ctx, password: str = PASSWORD, app: str | None = None):
    body = {"phone": PHONE, "password": password} | ({"app": app} if app else {})
    return await ctx.http.post("/api/v1/auth/login", json=body)


async def otp_login(ctx: Ctx, app: str):
    assert (await ctx.http.post("/api/v1/auth/otp/request", json={"phone": PHONE})).status_code == 200
    body = {"phone": PHONE, "code": ctx.sms.last_code(PHONE), "app": app}
    return await ctx.http.post("/api/v1/auth/otp/verify", json=body)


async def sessions(ctx: Ctx) -> int:
    return await ctx.db.scalar(select(func.count()).select_from(RefreshSession)) or 0


@pytest.mark.parametrize(
    ("role", "app"),
    [
        ("CUSTOMER", None),
        ("CUSTOMER", "customer"),
        ("DRIVER", "customer"),
        ("MANAGER", "admin"),
        ("SUPER_ADMIN", "admin"),
        ("WAREHOUSE", "admin"),
    ],
)
async def test_role_logs_into_own_app(ctx: Ctx, role: str, app: str | None):
    await make_user(ctx, role)
    res = await login_pw(ctx, app=app)
    assert res.status_code == 200, res.text
    assert res.json()["user"]["role"] == role


@pytest.mark.parametrize(
    ("role", "app", "code"),
    [
        ("MANAGER", "customer", "USE_ADMIN_PANEL"),
        ("SUPER_ADMIN", None, "USE_ADMIN_PANEL"),  # sukut bo'yicha — mijoz ilovasi
        ("WAREHOUSE", "customer", "USE_ADMIN_PANEL"),
        ("CUSTOMER", "admin", "PANEL_FORBIDDEN"),
        ("DRIVER", "admin", "PANEL_FORBIDDEN"),
    ],
)
async def test_role_rejected_in_other_app_without_tokens(ctx: Ctx, role: str, app: str | None, code: str):
    await make_user(ctx, role)
    res = await login_pw(ctx, app=app)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == code
    assert "accessToken" not in res.json()
    assert await sessions(ctx) == 0


async def test_wrong_password_in_other_app_does_not_reveal_role(ctx: Ctx):
    await make_user(ctx, "MANAGER")
    res = await login_pw(ctx, "wrong-pass", app="customer")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "INVALID_PASSWORD"


async def test_admin_app_does_not_register_unknown_phone(ctx: Ctx):
    res = await login_pw(ctx, app="admin")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "INVALID_PASSWORD"
    assert await ctx.db.scalar(select(User).where(User.phone == PHONE)) is None


async def test_admin_app_does_not_set_customer_password(ctx: Ctx):
    user = await make_user(ctx, "CUSTOMER", password=None)
    res = await login_pw(ctx, app="admin")
    assert res.status_code == 401
    await ctx.db.refresh(user)
    assert user.password_hash is None


async def test_otp_staff_rejected_in_customer_app(ctx: Ctx):
    await make_user(ctx, "MANAGER")
    res = await otp_login(ctx, "customer")
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "USE_ADMIN_PANEL"
    assert await sessions(ctx) == 0


async def test_otp_admin_app_does_not_register_unknown_phone(ctx: Ctx):
    res = await otp_login(ctx, "admin")
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "PANEL_FORBIDDEN"
    assert await ctx.db.scalar(select(User).where(User.phone == PHONE)) is None


async def test_unknown_app_422(ctx: Ctx):
    await make_user(ctx, "MANAGER")
    assert (await login_pw(ctx, app="backoffice")).status_code == 422
