"""Buyurtma sxemalari: konstantalar, Zod xabarlari bilan bir xil tiplar, body_of."""

import re
from collections.abc import Callable
from typing import Annotated, Any

from fastapi import Body
from pydantic import AfterValidator, BaseModel, BeforeValidator, ValidationError

from app.core.errors import AppError, validation_details
from app.core.schemas import custom_error

IDEMPOTENCY_KEY_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
MAX_DELIVERY_DAYS_AHEAD = 60

ORDER_STATUSES = ("NEW", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED", "CANCELLED")
DELIVERY_TYPES = ("DELIVERY", "PICKUP")
PAYMENT_TERMS = ("PREPAID", "ADVANCE", "ON_DELIVERY", "CREDIT")
PAYMENT_METHODS = ("CASH", "CARD_TRANSFER", "CLICK", "PAYME", "BANK_TRANSFER")


Issue = dict[str, str]
Rule = Callable[[dict[str, Any]], list[Issue]]


# ───────── Zod xabarlari bilan bir xil tiplar ─────────


def zenum(*values: str) -> Any:
    """z.enum([...])"""
    message = "Invalid option: expected one of " + "|".join(f'"{v}"' for v in values)

    def check(v: Any) -> str:
        if v not in values:
            raise custom_error(message)
        return v

    return Annotated[str, BeforeValidator(check)]


def zlist(item: Any, min_items: int = 0, max_items: int | None = None) -> Any:
    """z.array(item).min(a).max(b)"""

    def check(v: list[Any]) -> list[Any]:
        if len(v) < min_items:
            raise custom_error(f"Too small: expected array to have >={min_items} items")
        if max_items is not None and len(v) > max_items:
            raise custom_error(f"Too big: expected array to have <={max_items} items")
        return v

    return Annotated[list[item], AfterValidator(check)]  # type: ignore[valid-type]


def zcoerce_int(minimum: int, maximum: int | None = None) -> Any:
    """z.coerce.number().int().min(a).max(b) — query parametrlari uchun"""

    def check(v: Any) -> int:
        try:
            n = float(v) if not isinstance(v, (int, float)) else v
        except TypeError, ValueError:
            raise custom_error("Invalid input: expected number, received NaN") from None
        if n != n:
            raise custom_error("Invalid input: expected number, received NaN")
        if not float(n).is_integer():
            raise custom_error("Invalid input: expected int, received number")
        if n < minimum:
            raise custom_error(f"Too small: expected number to be >={minimum}")
        if maximum is not None and n > maximum:
            raise custom_error(f"Too big: expected number to be <={maximum}")
        return int(n)

    return Annotated[int, BeforeValidator(check)]


OrderStatus = zenum(*ORDER_STATUSES)
DeliveryType = zenum(*DELIVERY_TYPES)
PaymentTerms = zenum(*PAYMENT_TERMS)
PaymentMethod = zenum(*PAYMENT_METHODS)
PageNo = zcoerce_int(1)
PageLimit = zcoerce_int(1, 100)

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _iso_date(v: Any) -> str:
    if not isinstance(v, str):
        raise custom_error("Invalid input: expected string")
    if not _ISO_DATE.match(v):
        raise custom_error("INVALID_DATE")
    return v


IsoDate = Annotated[str, BeforeValidator(_iso_date)]


def _issue(path: str, message: str) -> Issue:
    return {"path": path, "message": message}


def _invalid(details: list[Any]) -> AppError:
    return AppError("VALIDATION_ERROR", "Ma'lumotlar noto'g'ri", 422, details)


_CHECK_TYPES = {
    "too_short",
    "too_long",
    "string_too_short",
    "string_too_long",
    "greater_than",
    "greater_than_equal",
    "less_than",
    "less_than_equal",
}


def _non_fatal(e: Any) -> bool:
    """Zod 4: tekshiruv (check/refine) xatosi to'xtatmaydi — ota obyekt refine'i baribir ishlaydi"""
    if e["type"] in _CHECK_TYPES:
        return True
    msg = str(e.get("msg", ""))
    return e["type"] == "custom" and not msg.startswith("Invalid") and msg != "INVALID_QTY"


def body_of[M: BaseModel](model: type[M], rule: Rule | None = None) -> Callable[..., Any]:
    """ZodPipe kabi: tana sxema bilan tekshiriladi, keyin superRefine (rule) — 422 VALIDATION_ERROR"""

    async def dep(raw: Annotated[Any, Body()] = None) -> M:
        data = {} if raw is None else raw
        try:
            body = model.model_validate(data)
        except ValidationError as e:
            errors = list(e.errors())
            details: list[Any] = validation_details(errors)
            if rule and isinstance(data, dict) and all(_non_fatal(x) for x in errors):
                details += rule(data)
            raise _invalid(details) from None
        if rule and (issues := rule(data)):
            raise _invalid(issues)
        return body

    return dep
