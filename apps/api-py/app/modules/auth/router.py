from typing import Annotated

from fastapi import Header, Request
from pydantic import Field, StringConstraints
from sqlalchemy import select

from app.auth import otp, tokens
from app.auth.apps import ClientApp, can_self_register, ensure_app_role, wrong_app
from app.auth.password import hash_password, verify_password
from app.core.errors import AppError
from app.core.http import api_router
from app.core.redis import redis
from app.core.schemas import Password, Phone, Schema
from app.db import Db, transaction
from app.models import CustomerProfile, User, utcnow
from app.modules.me.service import get_me

router = api_router("/auth", tags=["auth"])

# Bitta raqamga 15 daqiqada shuncha noto'g'ri parol
LOGIN_FAIL_LIMIT = 10
LOGIN_FAIL_WINDOW = 900


class OtpRequest(Schema):
    phone: Phone


class OtpVerify(Schema):
    phone: Phone
    code: Annotated[str, StringConstraints(pattern=r"^\d{4,6}$")]
    app: ClientApp = "customer"


class PasswordLogin(Schema):
    phone: Phone
    password: Password
    # Qaysi ilovadan kirilmoqda — rol shu ilovaga mos bo'lishi shart (app/auth/apps.py)
    app: ClientApp = "customer"


class RefreshInput(Schema):
    refresh_token: Annotated[str, Field(min_length=20)]


def _ip(request: Request) -> str | None:
    # Reverse proxy (Caddy/Render) orqasida haqiqiy IP — OTP rate limit uchun
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/otp/request")
async def otp_request(body: OtpRequest, request: Request, db: Db):
    return await otp.request_otp(db, body.phone, _ip(request))


@router.post("/otp/verify")
async def otp_verify(body: OtpVerify, db: Db, user_agent: Annotated[str | None, Header()] = None):
    await otp.verify_otp(db, body.phone, body.code)
    # Yangi raqam — mijoz sifatida ro'yxatdan o'tadi (faqat mijoz ilovasida). Xodimlarni admin yaratadi.
    async with transaction(db):
        user = await db.scalar(select(User).where(User.phone == body.phone).with_for_update())
        if user:
            ensure_app_role(body.app, user.role)
            user.last_login_at = utcnow()
        elif not can_self_register(body.app):
            raise wrong_app(body.app)
        else:
            user = User(phone=body.phone, role="CUSTOMER")
            db.add(user)
            await db.flush()
            db.add(CustomerProfile(user_id=user.id))
    return await _session(db, user, user_agent, body.app)


@router.post("/login")
async def login(body: PasswordLogin, db: Db, user_agent: Annotated[str | None, Header()] = None):
    """
    Telefon + parol (SMS o'rniga, vaqtincha).
    Yangi raqam — mijoz sifatida shu parol bilan ro'yxatdan o'tadi.
    Paroli yo'q mijoz (OTP orqali ro'yxatdan o'tgan) — birinchi kirishda parol o'rnatadi.
    Paroli yo'q xodim — yo'q: xodim parolini faqat super admin o'rnatadi, aks holda
    raqamni bilgan har kim xodim hisobini egallab olardi.
    Admin panel hisob yaratmaydi va parol o'rnatmaydi — notanish raqam "parol noto'g'ri" oladi
    (qaysi raqam ro'yxatda borligi bilinmaydi). Rol ilovaga mos kelmasa — token berilmaydi.
    """
    fail_key = f"login:fail:{body.phone}"
    fails = int(await redis().get(fail_key) or 0)
    if fails >= LOGIN_FAIL_LIMIT:
        raise AppError(
            "LOGIN_RATE_LIMIT",
            "Juda ko'p urinish, keyinroq qayta urining",
            429,
            {"retryAfter": max(await redis().ttl(fail_key), 1)},
        )

    existing = await db.scalar(select(User).where(User.phone == body.phone))
    if not can_self_register(body.app) and not (existing and existing.password_hash):
        await _count_fail(fail_key)
        raise invalid_password()
    if not existing:
        async with transaction(db):
            user = User(phone=body.phone, role="CUSTOMER", password_hash=await hash_password(body.password))
            db.add(user)
            await db.flush()
            db.add(CustomerProfile(user_id=user.id))
    elif not existing.password_hash:
        if existing.role != "CUSTOMER":
            raise AppError.unauthorized("PASSWORD_NOT_SET", "Parol o'rnatilmagan, administratorga murojaat qiling")
        async with transaction(db):
            existing.password_hash = await hash_password(body.password)
            existing.last_login_at = utcnow()
        user = existing
    elif await verify_password(body.password, existing.password_hash):
        existing.last_login_at = utcnow()
        if fails:
            await redis().delete(fail_key)
        user = existing
    else:
        await _count_fail(fail_key)
        raise invalid_password()
    return await _session(db, user, user_agent, body.app)


@router.post("/refresh")
async def refresh(body: RefreshInput, db: Db, user_agent: Annotated[str | None, Header()] = None):
    return await tokens.rotate(db, body.refresh_token, user_agent)


@router.post("/logout", status_code=204)
async def logout(body: RefreshInput, db: Db):
    await tokens.revoke(db, body.refresh_token)


async def _count_fail(fail_key: str) -> None:
    async with redis().pipeline(transaction=True) as pipe:
        pipe.incr(fail_key)
        pipe.expire(fail_key, LOGIN_FAIL_WINDOW, nx=True)
        await pipe.execute()


async def _session(db: Db, user: User, user_agent: str | None, app: ClientApp):
    """
    Tokenlar va to'liq profil ("me") — ilova kirgach alohida /me so'ramaydi.
    Kutilayotgan o'zgarishlar (last_login_at) token bilan bitta tranzaksiyada saqlanadi.
    """
    if not user.is_active:
        raise AppError.forbidden("Hisob bloklangan")
    ensure_app_role(app, user.role)
    async with transaction(db):
        pair = await tokens.issue(db, user.id, user.role, user_agent)
    return {
        **pair,
        "user": {"id": user.id, "phone": user.phone, "fullName": user.full_name, "role": user.role, "locale": user.locale},
        "me": await get_me(db, user.id),
        "isNew": user.full_name is None,
    }


def invalid_password() -> AppError:
    return AppError.unauthorized("INVALID_PASSWORD", "Parol noto'g'ri")
