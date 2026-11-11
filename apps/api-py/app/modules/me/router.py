from typing import Annotated, Literal

from fastapi import Path
from pydantic import Field, StringConstraints
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from app.auth import tokens
from app.auth.deps import CurrentUser
from app.auth.password import hash_password, verify_password
from app.core.errors import AppError
from app.core.http import api_router
from app.core.schemas import Password, Schema, trimmed
from app.db import Db, transaction
from app.models import CustomerProfile, DeviceToken, User, new_id, utcnow
from app.modules.auth.router import invalid_password
from app.modules.me.service import get_me

router = api_router("/me", tags=["me"])


class UpdateMe(Schema):
    full_name: trimmed(2, 120) = None  # type: ignore[valid-type]
    locale: Literal["uz", "ru", "en"] = None  # type: ignore[assignment]
    customer_type: Literal["INDIVIDUAL", "MASTER", "COMPANY"] = None  # type: ignore[assignment]
    company_name: trimmed(0, 200) | None = None  # type: ignore[valid-type]
    inn: Annotated[str, StringConstraints(pattern=r"^\d{9}$")] | None = None


class ChangePassword(Schema):
    current_password: Annotated[str, Field(max_length=100)] | None = None
    new_password: Password


class DeviceTokenInput(Schema):
    token: Annotated[str, Field(min_length=10, max_length=300)]
    platform: Literal["ios", "android", "web"]


@router.get("")
async def me(user: CurrentUser, db: Db):
    return await get_me(db, user.id)


@router.patch("")
async def update(user: CurrentUser, body: UpdateMe, db: Db):
    fields = body.model_fields_set
    profile_fields = {"customer_type": "type", "company_name": "company_name", "inn": "inn"}
    touches_profile = bool(fields & profile_fields.keys())
    if touches_profile and user.role != "CUSTOMER":
        raise AppError.forbidden("Xodim profilida mijoz maydonlari yo'q")

    async with transaction(db):
        u = await db.get(User, user.id)
        if not u:
            raise AppError.not_found("Foydalanuvchi")
        if "full_name" in fields and body.full_name is not None:
            u.full_name = body.full_name
        if "locale" in fields and body.locale is not None:
            u.locale = body.locale
        u.updated_at = utcnow()
        if touches_profile:
            profile = await db.get(CustomerProfile, user.id)
            if not profile:
                raise AppError("NOT_FOUND", "Yozuv topilmadi", 404)
            for f, col in profile_fields.items():
                if f in fields:
                    setattr(profile, col, getattr(body, f))
    return await get_me(db, user.id)


@router.post("/password", status_code=204)
async def change_password(user: CurrentUser, body: ChangePassword, db: Db):
    """Joriy sessiyadan boshqa barcha sessiyalar yopiladi"""
    current = await db.scalar(select(User.password_hash).where(User.id == user.id))
    if current and not (body.current_password and await verify_password(body.current_password, current)):
        raise invalid_password()
    async with transaction(db):
        u = await db.get(User, user.id)
        assert u is not None
        u.password_hash = await hash_password(body.new_password)
    await tokens.revoke_all_for_user(db, user.id, user.session_family)


@router.post("/devices", status_code=204)
async def add_device(user: CurrentUser, body: DeviceTokenInput, db: Db):
    # Token boshqa foydalanuvchida bo'lsa (qurilmada akkaunt almashgan) — ko'chiriladi
    async with transaction(db):
        stmt = insert(DeviceToken).values(id=new_id(), user_id=user.id, token=body.token, platform=body.platform)
        await db.execute(
            stmt.on_conflict_do_update(
                index_elements=[DeviceToken.token],
                set_={"user_id": user.id, "platform": body.platform, "last_seen_at": utcnow()},
            )
        )


@router.delete("/devices/{token}", status_code=204)
async def remove_device(user: CurrentUser, token: Annotated[str, Path()], db: Db):
    async with transaction(db):
        await db.execute(delete(DeviceToken).where(DeviceToken.user_id == user.id, DeviceToken.token == token))
