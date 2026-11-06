import hashlib
import hmac
import secrets
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import AppError
from app.core.redis import redis
from app.db import transaction
from app.models import OtpCode, utcnow
from app.services.senders import sms_sender

OTP_TTL_SECONDS = 180
OTP_MAX_ATTEMPTS = 5
TEST_CODE = "000000"

# (kalit, oyna (s), limit)
RATE_LIMITS = (("min", 60, 1), ("hour", 3600, 5), ("day", 86400, 10))
IP_LIMIT_PER_HOUR = 30


def _hash(phone: str, code: str) -> str:
    return hmac.new(get_settings().OTP_PEPPER.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


async def _incr(key: str, window: int) -> int:
    async with redis().pipeline(transaction=True) as pipe:
        pipe.incr(key)
        pipe.expire(key, window, nx=True)
        n, _ = await pipe.execute()
    return int(n)


async def _check_rate_limit(phone: str, ip: str | None) -> None:
    for name, window, limit in RATE_LIMITS:
        key = f"otp:{name}:{phone}"
        if await _incr(key, window) > limit:
            ttl = await redis().ttl(key)
            raise AppError("OTP_RATE_LIMIT", "Juda ko'p so'rov, keyinroq urinib ko'ring", 429, {"retryAfter": max(ttl, 1)})
    if ip and await _incr(f"otp:ip:{ip}", 3600) > IP_LIMIT_PER_HOUR:
        raise AppError("OTP_RATE_LIMIT", "Juda ko'p so'rov", 429)


async def request_otp(db: AsyncSession, phone: str, ip: str | None) -> dict[str, int]:
    is_test = phone in get_settings().OTP_TEST_PHONES
    if not is_test:
        await _check_rate_limit(phone, ip)

    code = TEST_CODE if is_test else f"{secrets.randbelow(1_000_000):06d}"
    async with transaction(db):
        db.add(OtpCode(phone=phone, code_hash=_hash(phone, code), expires_at=utcnow() + timedelta(seconds=OTP_TTL_SECONDS)))
    if not is_test:
        await sms_sender().send(phone, f"Mebel Order: tasdiqlash kodi {code}. Kodni hech kimga bermang.")
    return {"expiresIn": OTP_TTL_SECONDS, "retryAfter": 60}


async def verify_otp(db: AsyncSession, phone: str, code: str) -> None:
    """Muvaffaqiyatli bo'lsa kod ishlatilgan deb belgilanadi, aks holda xato"""
    otp = await db.scalar(
        select(OtpCode)
        .where(OtpCode.phone == phone, OtpCode.used_at.is_(None), OtpCode.expires_at > utcnow())
        .order_by(OtpCode.created_at.desc())
        .limit(1)
    )
    if not otp:
        raise AppError("OTP_EXPIRED", "Kod muddati o'tgan, yangisini so'rang")
    if otp.attempts >= OTP_MAX_ATTEMPTS:
        raise AppError("OTP_TOO_MANY_ATTEMPTS", "Urinishlar tugadi, yangi kod so'rang", 429)

    if not hmac.compare_digest(otp.code_hash, _hash(phone, code)):
        attempts = otp.attempts
        async with transaction(db):
            await db.execute(update(OtpCode).where(OtpCode.id == otp.id).values(attempts=OtpCode.attempts + 1))
        raise AppError("OTP_INVALID", "Kod noto'g'ri", 400, {"attemptsLeft": OTP_MAX_ATTEMPTS - attempts - 1})

    # Ikki parallel so'rov bitta kodni ikki marta ishlata olmasin
    async with transaction(db):
        res = await db.execute(update(OtpCode).where(OtpCode.id == otp.id, OtpCode.used_at.is_(None)).values(used_at=utcnow()))
    if not res.rowcount:  # type: ignore[attr-defined]
        raise AppError("OTP_EXPIRED", "Kod allaqachon ishlatilgan")
