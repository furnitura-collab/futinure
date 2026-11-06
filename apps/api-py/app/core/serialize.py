"""
JSON'ga chiqarish — Prisma + NestJS SerializeInterceptor bilan bir xil natija:
- pul (int) → son;
- miqdor (Decimal) → normallashgan satr: "12.5", "120" (Prisma Decimal.toString);
- vaqt → "2026-11-06T10:00:00.000Z"; sana (@db.Date) → "2026-11-10T00:00:00.000Z";
- ORM obyekti → camelCase kalitli dict (ustunlar sxema tartibida, password_hash hech qachon).
"""

from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import DeclarativeBase

HIDDEN = {"password_hash"}


def camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(p[:1].upper() + p[1:] for p in rest)


def decimal_str(d: Decimal) -> str:
    if d == 0:
        return "0"
    s = format(d.normalize(), "f")
    return s


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    dt = dt.astimezone(UTC)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def iso_date(d: date) -> str:
    return f"{d.isoformat()}T00:00:00.000Z"


def row(obj: DeclarativeBase, *, exclude: Iterable[str] = (), **extra: Any) -> dict[str, Any]:
    """ORM obyektining barcha skalyar ustunlari (Prisma'ning select'siz natijasi kabi) + qo'shimcha maydonlar"""
    skip = HIDDEN | set(exclude)
    mapper = sa_inspect(type(obj))
    out: dict[str, Any] = {}
    for attr in mapper.column_attrs:
        if attr.key in skip:
            continue
        out[camel(attr.key)] = getattr(obj, attr.key)
    out.update(extra)
    return out


def pick(obj: DeclarativeBase, *fields: str, **extra: Any) -> dict[str, Any]:
    """Prisma `select` kabi — faqat ko'rsatilgan ustunlar (snake_case nomlar), berilgan tartibda"""
    out = {camel(f): getattr(obj, f) for f in fields}
    out.update(extra)
    return out


def dump(value: Any) -> Any:
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else value
    if isinstance(value, Decimal):
        return decimal_str(value)
    if isinstance(value, datetime):
        return iso(value)
    if isinstance(value, date):
        return iso_date(value)
    if isinstance(value, DeclarativeBase):
        return dump(row(value))
    if isinstance(value, Mapping):
        return {str(k): dump(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [dump(v) for v in value]
    return value
