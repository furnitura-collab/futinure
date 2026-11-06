"""Access (JWT, HS256 — @nestjs/jwt bilan mos) va refresh token'lar (rotatsiya, oila bo'yicha bekor qilish)."""

import hashlib
import secrets
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.config import get_settings
from app.core.errors import AppError
from app.db import transaction
from app.models import RefreshSession, utcnow


@dataclass(frozen=True)
class AccessPayload:
    sub: str
    role: str
    # Refresh sessiya oilasi — "boshqa sessiyalarni yopish" uchun joriy sessiyani ajratadi
    fam: str | None = None


def sign_access(user_id: str, role: str, family_id: str) -> str:
    env = get_settings()
    now = int(time.time())
    payload = {"sub": user_id, "role": role, "fam": family_id, "iat": now, "exp": now + env.access_ttl_seconds}
    return jwt.encode(payload, env.JWT_ACCESS_SECRET, algorithm="HS256")


def decode_access(token: str) -> AccessPayload | None:
    try:
        p = jwt.decode(token, get_settings().JWT_ACCESS_SECRET, algorithms=["HS256"])
        return AccessPayload(sub=p["sub"], role=p["role"], fam=p.get("fam"))
    except jwt.PyJWTError, KeyError:
        return None


def sha256(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()


def _invalid() -> AppError:
    return AppError.unauthorized("INVALID_REFRESH_TOKEN", "Sessiya tugagan, qayta kiring")


async def issue(
    db: AsyncSession, user_id: str, role: str, user_agent: str | None = None, family_id: str | None = None
) -> dict[str, str]:
    family_id = family_id or str(uuid.uuid4())
    refresh = secrets.token_urlsafe(32)
    async with transaction(db):
        db.add(
            RefreshSession(
                user_id=user_id,
                token_hash=sha256(refresh),
                family_id=family_id,
                user_agent=user_agent[:300] if user_agent else None,
                expires_at=utcnow() + timedelta(days=get_settings().REFRESH_TTL_DAYS),
            )
        )
    return {"accessToken": sign_access(user_id, role, family_id), "refreshToken": refresh}


async def rotate(db: AsyncSession, refresh_token: str, user_agent: str | None = None) -> dict[str, str]:
    """
    Rotatsiya: eski token bekor qilinadi, yangisi beriladi.
    Bekor qilingan token qayta kelsa — o'g'irlangan deb hisoblab, butun oilani bekor qilamiz.
    """
    session = await db.scalar(
        select(RefreshSession).options(joinedload(RefreshSession.user)).where(RefreshSession.token_hash == sha256(refresh_token))
    )
    if not session:
        raise _invalid()
    if session.revoked_at:
        await _revoke_where(db, RefreshSession.family_id == session.family_id)
        raise _invalid()
    if session.expires_at < datetime.now(UTC) or not session.user.is_active:
        raise _invalid()
    # Parallel refresh — ikkinchisi yutqazadi
    if await _revoke_where(db, RefreshSession.id == session.id) == 0:
        raise _invalid()
    return await issue(db, session.user.id, session.user.role, user_agent, session.family_id)


async def revoke(db: AsyncSession, refresh_token: str) -> None:
    await _revoke_where(db, RefreshSession.token_hash == sha256(refresh_token))


async def revoke_all_for_user(db: AsyncSession, user_id: str, except_family_id: str | None = None) -> None:
    """except_family_id — joriy qurilma sessiyasi saqlanadi"""
    conds = [RefreshSession.user_id == user_id]
    if except_family_id:
        conds.append(RefreshSession.family_id != except_family_id)
    await _revoke_where(db, *conds)


async def _revoke_where(db: AsyncSession, *conds: object) -> int:
    async with transaction(db):
        res = await db.execute(
            update(RefreshSession).where(*conds, RefreshSession.revoked_at.is_(None)).values(revoked_at=utcnow())  # type: ignore[arg-type]
        )
    return res.rowcount or 0  # type: ignore[attr-defined]
