"""
Kiruvchi ma'lumot sxemalari — @mebel/shared Zod sxemalarining Pydantic nusxasi.
JSON kalitlari camelCase (alias), Python'da snake_case. Noma'lum kalitlar tashlab yuboriladi (Zod kabi).
Xato xabari Zod'dagi kod bilan bir xil bo'lishi uchun: custom_error("INVALID_QTY").
"""

import re
from typing import Annotated, Any

from fastapi import Depends, Query
from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, Strict
from pydantic.alias_generators import to_camel
from pydantic_core import PydanticCustomError

from app.domain.phone import normalize_uz_phone
from app.domain.quantity import from_milli, to_milli


def custom_error(message: str) -> PydanticCustomError:
    return PydanticCustomError("custom", message)


def js_type(v: Any) -> str:
    """Zod xabaridagi "received ..." uchun JS tip nomi"""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, (int, float)):
        return "number"
    if isinstance(v, str):
        return "string"
    if isinstance(v, (list, tuple)):
        return "array"
    return "object"


def not_string(v: Any) -> PydanticCustomError:
    return custom_error(f"Invalid input: expected string, received {js_type(v)}")


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")

    def set_fields(self) -> dict[str, Any]:
        """Faqat yuborilgan maydonlar (Zod .partial() bilan PATCH uchun)"""
        return {k: getattr(self, k) for k in self.model_fields_set}


# ───────── Miqdor ─────────


def _qty(v: Any) -> str:
    if isinstance(v, bool) or not isinstance(v, (str, int, float)):
        raise custom_error("INVALID_QTY")
    milli = to_milli(v)
    if milli is None:
        raise custom_error("INVALID_QTY")
    return from_milli(milli)


def _positive(v: str) -> str:
    if (to_milli(v) or 0) <= 0:
        raise custom_error("QTY_MUST_BE_POSITIVE")
    return v


# "12.5" yoki 12.5 → normallashgan "12.5". Maks 3 kasr xona
Qty = Annotated[str, BeforeValidator(_qty)]
PositiveQty = Annotated[str, BeforeValidator(_qty), AfterValidator(_positive)]

# Pul — butun so'm. 10 trln dan oshmaydi
Money = Annotated[int, Strict(), Field(ge=0, le=10_000_000_000_000)]

UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def _uuid(v: Any) -> str:
    if not isinstance(v, str) or not UUID_RE.match(v):
        raise custom_error("Invalid UUID")
    return v.lower()


Uuid = Annotated[str, BeforeValidator(_uuid)]


# ───────── Telefon ─────────


def _phone(v: Any) -> str:
    if not isinstance(v, str):
        raise custom_error("INVALID_PHONE")
    phone = normalize_uz_phone(v)
    if not phone:
        raise custom_error("INVALID_PHONE")
    return phone


Phone = Annotated[str, BeforeValidator(_phone)]


# ───────── So'rov parametrlari ─────────


def _bool_query(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if v not in ("true", "false", "1", "0"):
        raise custom_error('Invalid option: expected one of "true"|"false"|"1"|"0"')
    return v in ("true", "1")


BoolQuery = Annotated[bool, BeforeValidator(_bool_query)]


class Page(Schema):
    page: int = 1
    limit: int = 20

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


def page_query(
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page:
    return Page(page=page, limit=limit)


PageQuery = Annotated[Page, Depends(page_query)]


def paginated(items: list[Any], total: int, q: Page) -> dict[str, Any]:
    return {"items": items, "total": total, "page": q.page, "limit": q.limit}


# ───────── Satrlar ─────────


def _password(v: Any) -> str:
    if not isinstance(v, str):
        raise not_string(v)
    if len(v) < 6:
        raise custom_error("PASSWORD_TOO_SHORT")
    if len(v) > 100:
        raise custom_error("Too big: expected string to have <=100 characters")
    return v


# Zod: z.string().min(PASSWORD_MIN, 'PASSWORD_TOO_SHORT').max(100)
Password = Annotated[str, BeforeValidator(_password)]


def trimmed(min_length: int = 0, max_length: int | None = None) -> Any:
    """Zod: z.string().trim().min(a).max(b) — avval bo'shliqlar kesiladi, keyin uzunlik tekshiriladi"""

    def check(v: Any) -> str:
        if not isinstance(v, str):
            raise not_string(v)
        v = v.strip()
        if len(v) < min_length:
            raise custom_error(f"Too small: expected string to have >={min_length} characters")
        if max_length is not None and len(v) > max_length:
            raise custom_error(f"Too big: expected string to have <={max_length} characters")
        return v

    return Annotated[str, BeforeValidator(check)]
