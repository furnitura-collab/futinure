"""Katalog sxemalari: yordamchi tiplar (Zod z.number() / z.number().int()) va PATCH bazasi."""

import re
from collections.abc import Callable
from typing import Annotated, Any, ClassVar, Literal

from pydantic import AfterValidator, BeforeValidator

from app.core.schemas import Schema, custom_error, trimmed

UNITS = ("PIECE", "SHEET", "METER", "SQM", "KG", "SET", "PACK")
PRODUCT_KINDS = ("GOODS", "BOARD", "EDGE")
Unit = Literal["PIECE", "SHEET", "METER", "SQM", "KG", "SET", "PACK"]
ProductKind = Literal["GOODS", "BOARD", "EDGE"]
PRODUCT_SORTS = ("popular", "price_asc", "price_desc", "name", "new")


# ───────── Yordamchi tiplar (Zod z.number() / z.number().int()) ─────────


def _number(v: Any) -> float | int:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise custom_error(f"Invalid input: expected number, received {_js_type(v)}")
    return v


def _int(v: Any) -> int:
    v = _number(v)
    if isinstance(v, float):
        if not v.is_integer():
            raise custom_error("Invalid input: expected int, received number")
        return int(v)
    return v


def _js_type(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, str):
        return "string"
    if isinstance(v, (list, tuple)):
        return "array"
    return "object"


def _range(lo: float | None = None, hi: float | None = None, *, gt: float | None = None) -> Callable[[Any], Any]:
    def check(v: Any) -> Any:
        if gt is not None and not v > gt:
            raise custom_error(f"Too small: expected number to be >{gt:g}")
        if lo is not None and v < lo:
            raise custom_error(f"Too small: expected number to be >={lo:g}")
        if hi is not None and v > hi:
            raise custom_error(f"Too big: expected number to be <={hi:g}")
        return v

    return check


JsNumber = Annotated[float, BeforeValidator(_number)]
JsInt = Annotated[int, BeforeValidator(_int)]


def _str_max(n: int) -> Any:
    def check(v: Any) -> str:
        if not isinstance(v, str):
            raise custom_error(f"Invalid input: expected string, received {_js_type(v)}")
        if len(v) > n:
            raise custom_error(f"Too big: expected string to have <={n} characters")
        return v

    return Annotated[str, BeforeValidator(check)]


def _regex(pattern: str, message: str, max_len: int) -> Any:
    rx = re.compile(pattern)

    def check(v: str) -> str:
        if not rx.match(v):
            raise custom_error(message)
        if len(v) > max_len:
            raise custom_error(f"Too big: expected string to have <={max_len} characters")
        return v

    return check


Name = trimmed(1, 200)
OptionalText = trimmed(0, 5000)
Slug = Annotated[trimmed(), AfterValidator(_regex(r"^[a-z0-9]+(-[a-z0-9]+)*$", "INVALID_SLUG", 80))]  # type: ignore[misc]
Url500 = _str_max(500)


class PartialSchema(Schema):
    """Yaratish: yuborilgan maydonlar + default'lar. PATCH (PATCH = True): faqat yuborilgan maydonlar"""

    # Default'i yo'q maydonlar (faqat yuborilganda olinadi)
    NO_DEFAULT: ClassVar[frozenset[str]] = frozenset()
    PATCH: ClassVar[bool] = False

    def data(self) -> dict[str, Any]:
        if self.PATCH:
            return {k: getattr(self, k) for k in self.model_fields_set}
        return {k: getattr(self, k) for k in type(self).model_fields if k not in self.NO_DEFAULT or k in self.model_fields_set}
