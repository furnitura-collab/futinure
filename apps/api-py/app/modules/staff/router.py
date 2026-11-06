"""Xodimlar — faqat super admin boshqaradi"""

from typing import Annotated, Any

from pydantic import BeforeValidator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import tokens
from app.auth.deps import SuperAdmin
from app.auth.password import hash_password
from app.core.errors import AppError
from app.core.http import api_router
from app.core.params import UuidPath
from app.core.schemas import Password, Phone, Schema, custom_error, trimmed
from app.db import Db, transaction
from app.domain.state_machine import STAFF_ROLES
from app.models import User
from app.services.audit import audit

router = api_router("/admin/staff", tags=["staff"])

STAFF_FIELDS = ("id", "phone", "full_name", "role", "is_active", "last_login_at", "created_at")


def _staff_role(v: Any) -> str:
    if v not in STAFF_ROLES:
        raise custom_error("Invalid option: expected one of " + "|".join(f'"{r}"' for r in STAFF_ROLES))
    return v


StaffRole = Annotated[str, BeforeValidator(_staff_role)]


class CreateStaff(Schema):
    phone: Phone
    full_name: trimmed(2, 120)  # type: ignore[valid-type]
    role: StaffRole
    password: Password


class UpdateStaff(Schema):
    """Zod .partial(): yuborilmagan maydon o'zgarmaydi"""

    full_name: trimmed(2, 120) = None  # type: ignore[valid-type]
    role: StaffRole = None  # type: ignore[assignment]
    is_active: bool = None  # type: ignore[assignment]
    password: Password = None  # type: ignore[assignment]


def _json(u: User) -> dict[str, Any]:
    return {
        "id": u.id,
        "phone": u.phone,
        "fullName": u.full_name,
        "role": u.role,
        "isActive": u.is_active,
        "lastLoginAt": u.last_login_at,
        "createdAt": u.created_at,
    }


def phone_taken() -> AppError:
    return AppError("PHONE_TAKEN", "Bu raqam allaqachon ro'yxatdan o'tgan", 409)


async def _find_staff(db: AsyncSession, id: str) -> User | None:
    return await db.scalar(select(User).where(User.id == id, User.role.in_(STAFF_ROLES)))


@router.get("")
async def list_staff(_: SuperAdmin, db: Db):
    rows = await db.scalars(select(User).where(User.role.in_(STAFF_ROLES)).order_by(User.is_active.desc(), User.created_at.asc()))
    return [_json(u) for u in rows]


@router.post("", status_code=201)
async def create(actor: SuperAdmin, body: CreateStaff, db: Db):
    if await db.scalar(select(func.count()).select_from(User).where(User.phone == body.phone)):
        raise phone_taken()
    password_hash = await hash_password(body.password)
    data = {"phone": body.phone, "fullName": body.full_name, "role": body.role}
    try:
        async with transaction(db):
            staff = User(phone=body.phone, full_name=body.full_name, role=body.role, password_hash=password_hash)
            db.add(staff)
            await db.flush()
            await audit(db, actor_id=actor.id, entity="staff", entity_id=staff.id, action="create", after=data)
    except IntegrityError as e:
        # Parallel so'rov shu raqamni oldinroq band qilgan bo'lishi mumkin
        if getattr(e.orig, "sqlstate", None) == "23505" or "UniqueViolation" in type(e.orig).__name__:
            raise phone_taken() from e
        raise
    return _json(staff)


@router.patch("/{id}")
async def update(actor: SuperAdmin, id: UuidPath, body: UpdateStaff, db: Db):
    staff = await _find_staff(db, id)
    if not staff:
        raise AppError.not_found("Xodim")
    fields = body.model_fields_set
    # Tizim super adminsiz qolib ketmasin
    if id == actor.id and (
        ("is_active" in fields and body.is_active is False) or ("role" in fields and body.role and body.role != "SUPER_ADMIN")
    ):
        raise AppError("CANNOT_MODIFY_SELF", "O'zingizni bloklay yoki rolingizni pasaytira olmaysiz", 400)

    before = _json(staff)
    data = {k: v for k, v in body.model_dump(by_alias=True, exclude_unset=True).items() if k != "password"}
    password = body.password if "password" in fields else None
    async with transaction(db):
        if "full_name" in fields:
            staff.full_name = body.full_name
        if "role" in fields:
            staff.role = body.role
        if "is_active" in fields:
            staff.is_active = body.is_active
        if password:
            staff.password_hash = await hash_password(password)
        await db.flush()
        after = {**data, **({"password": "***"} if password else {})}
        await audit(db, actor_id=actor.id, entity="staff", entity_id=id, action="update", before=before, after=after)
    # Parol almashsa yoki bloklansa — barcha qurilmalardan chiqariladi (access token 15 daqiqada tugaydi)
    if password or ("is_active" in fields and body.is_active is False):
        await tokens.revoke_all_for_user(db, id)
    return _json(staff)
