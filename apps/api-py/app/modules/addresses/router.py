"""Mijoz manzillari va omborlar ro'yxati"""

from typing import Annotated, Any

from fastapi import Depends
from pydantic import BeforeValidator
from sqlalchemy import delete, func, select, update

from app.auth.deps import AuthUser, require_roles
from app.core.errors import AppError
from app.core.http import api_router
from app.core.params import UuidPath
from app.core.schemas import Schema, custom_error, trimmed
from app.db import Db, transaction
from app.models import Address, Warehouse

router = api_router(tags=["addresses"])

MAX_ADDRESSES = 20

Customer = Annotated[AuthUser, Depends(require_roles("CUSTOMER"))]


def _received(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, (int, float)):
        return "number"
    if isinstance(v, str):
        return "string"
    return "array" if isinstance(v, list) else "object"


def znumber(minimum: float, maximum: float, *, integer: bool = False) -> Any:
    """Zod z.number()[.int()].min(a).max(b) — xato matnlari ham Zod'dagidek"""

    def check(v: Any) -> float | int:
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise custom_error(f"Invalid input: expected number, received {_received(v)}")
        if integer and not float(v).is_integer():
            raise custom_error("Invalid input: expected int, received number")
        if v < minimum:
            raise custom_error(f"Too small: expected number to be >={minimum:g}")
        if v > maximum:
            raise custom_error(f"Too big: expected number to be <={maximum:g}")
        return int(v) if integer else float(v)

    return Annotated[int if integer else float, BeforeValidator(check)]


def _bool(v: Any) -> bool:
    if not isinstance(v, bool):
        raise custom_error(f"Invalid input: expected boolean, received {_received(v)}")
    return v


ZBool = Annotated[bool, BeforeValidator(_bool)]
Floor = znumber(-2, 50, integer=True)
# O'zbekiston chegaralari (taxminan) — xaritada adashib bosilgan nuqtani ushlaydi
Lat = znumber(37, 46)
Lng = znumber(55, 74)


class AddressInput(Schema):
    label: trimmed(0, 60) | None = None  # type: ignore[valid-type]
    address_text: trimmed(5, 500)  # type: ignore[valid-type]
    lat: Lat  # type: ignore[valid-type]
    lng: Lng  # type: ignore[valid-type]
    floor: Floor | None = None  # type: ignore[valid-type]
    needs_loaders: ZBool = False
    comment: trimmed(0, 500) | None = None  # type: ignore[valid-type]


class AddressUpdate(Schema):
    label: trimmed(0, 60) | None = None  # type: ignore[valid-type]
    address_text: trimmed(5, 500) = None  # type: ignore[valid-type]
    lat: Lat = None  # type: ignore[valid-type]
    lng: Lng = None  # type: ignore[valid-type]
    floor: Floor | None = None  # type: ignore[valid-type]
    needs_loaders: ZBool = False
    comment: trimmed(0, 500) | None = None  # type: ignore[valid-type]

    def values(self) -> dict[str, Any]:
        """PATCH: faqat yuborilgan maydonlar o'zgaradi"""
        return {k: getattr(self, k) for k in self.model_fields_set}


@router.get("/addresses")
async def list_addresses(u: Customer, db: Db):
    return list(await db.scalars(select(Address).where(Address.user_id == u.id).order_by(Address.created_at.desc())))


@router.post("/addresses", status_code=201)
async def create(u: Customer, body: AddressInput, db: Db):
    if (await db.scalar(select(func.count()).select_from(Address).where(Address.user_id == u.id)) or 0) >= MAX_ADDRESSES:
        raise AppError("TOO_MANY_ADDRESSES", f"Ko'pi bilan {MAX_ADDRESSES} ta manzil")
    async with transaction(db):
        a = Address(user_id=u.id, **body.model_dump())
        db.add(a)
        await db.flush()
    return a


@router.patch("/addresses/{id}")
async def update_address(u: Customer, id: UuidPath, body: AddressUpdate, db: Db):
    mine = (Address.id == id, Address.user_id == u.id)
    if values := body.values():
        async with transaction(db):
            res = await db.execute(update(Address).where(*mine).values(**values))
        found = bool(res.rowcount)  # type: ignore[attr-defined]
    else:
        found = bool(await db.scalar(select(Address.id).where(*mine)))
    if not found:
        raise AppError.not_found("Manzil")
    a = await db.scalar(select(Address).where(Address.id == id).execution_options(populate_existing=True))
    if not a:
        raise AppError("NOT_FOUND", "Yozuv topilmadi", 404)
    return a


@router.delete("/addresses/{id}", status_code=204)
async def remove(u: Customer, id: UuidPath, db: Db):
    """Buyurtmalarda manzil nusxasi saqlanadi — o'chirish eski buyurtmalarga ta'sir qilmaydi"""
    async with transaction(db):
        res = await db.execute(delete(Address).where(Address.id == id, Address.user_id == u.id))
    if not res.rowcount:  # type: ignore[attr-defined]
        raise AppError.not_found("Manzil")


@router.get("/warehouses")
async def warehouses(db: Db):
    """Ochiq (Public)"""
    rows = await db.scalars(select(Warehouse).where(Warehouse.is_active.is_(True)).order_by(Warehouse.name.asc()))
    return [
        {
            "id": w.id,
            "name": w.name,
            "addressText": w.address_text,
            "lat": w.lat,
            "lng": w.lng,
            "phone": w.phone,
            "workHours": w.work_hours,
        }
        for w in rows
    ]
