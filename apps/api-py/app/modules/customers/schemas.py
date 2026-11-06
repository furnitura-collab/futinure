"""
Mijozlar moliyasi uchun kiruvchi sxemalar — packages/shared/src/schemas/payments.ts nusxasi.
So'rov parametrlari (query) uchun: `q: Annotated[LedgerQuery, Query()]`.
"""

import re
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BeforeValidator, Field, StrictInt

from app.core.schemas import BoolQuery, Money, Schema, Uuid, custom_error, trimmed

PaymentMethod = Literal["CASH", "CARD_TRANSFER", "CLICK", "PAYME", "BANK_TRANSFER"]
CustomerType = Literal["INDIVIDUAL", "MASTER", "COMPANY"]

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _iso_date(v: Any) -> str:
    if not isinstance(v, str):
        raise custom_error("Invalid input: expected string")
    if not _ISO_DATE.match(v):
        raise custom_error("INVALID_DATE")
    return v


IsoDate = Annotated[str, BeforeValidator(_iso_date)]


def _positive(v: int) -> int:
    if v <= 0:
        raise custom_error("AMOUNT_MUST_BE_POSITIVE")
    return v


PositiveMoney = Annotated[Money, AfterValidator(_positive)]


# ───────── So'rovlar ─────────


class PeriodQuery(Schema):
    date_from: IsoDate | None = Field(default=None, alias="from")
    date_to: IsoDate | None = Field(default=None, alias="to")


class LedgerQuery(PeriodQuery):
    page: Annotated[int, Field(ge=1)] = 1
    limit: Annotated[int, Field(ge=1, le=100)] = 20


class AdminCustomerListQuery(Schema):
    page: Annotated[int, Field(ge=1)] = 1
    limit: Annotated[int, Field(ge=1, le=100)] = 20
    q: trimmed(2, 100) | None = None  # type: ignore[valid-type]
    price_group_id: Uuid | None = None
    # Faqat qarzdorlar (balans > 0)
    debtors: BoolQuery | None = None
    # Faqat muddati o'tgan qarzi borlar
    overdue: BoolQuery | None = None


# ───────── Tana (body) ─────────


def _inn(v: Any) -> Any:
    if v is None:
        return v
    if not isinstance(v, str):
        raise custom_error("Invalid input: expected string")
    if not re.fullmatch(r"\d{9}", v):
        raise custom_error("INVALID_INN")
    return v


def _non_zero(v: int) -> int:
    if v == 0:
        raise custom_error("AMOUNT_ZERO")
    return v


def _methods(v: list[str]) -> list[str]:
    if len(set(v)) != len(v):
        raise custom_error("DUPLICATE_METHOD")
    return v


class AdminCustomerUpdate(Schema):
    """Zod .partial(): faqat yuborilgan maydonlar o'zgaradi (body.model_fields_set)"""

    full_name: trimmed(2, 120) = None  # type: ignore[valid-type]
    is_active: bool = None  # type: ignore[assignment]
    type: CustomerType = None  # type: ignore[assignment]
    company_name: trimmed(0, 200) | None = None  # type: ignore[valid-type]
    inn: Annotated[str | None, BeforeValidator(_inn)] = None
    price_group_id: Uuid | None = None
    credit_limit: Money = None  # type: ignore[assignment]
    payment_term_days: Annotated[StrictInt, Field(ge=0, le=365)] = None  # type: ignore[assignment]
    allowed_payment_methods: Annotated[list[PaymentMethod], Field(min_length=1), AfterValidator(_methods)] = None  # type: ignore[assignment]


class LedgerAdjustInput(Schema):
    """Qo'lda tuzatish. Ishorali: musbat — qarz oshadi, manfiy — kamayadi"""

    amount: Annotated[StrictInt, Field(ge=-10_000_000_000_000, le=10_000_000_000_000), AfterValidator(_non_zero)]
    description: trimmed(5, 500)  # type: ignore[valid-type]


class RefundInput(Schema):
    """Mijozga pul qaytarish (haqdor bo'lsa)"""

    amount: PositiveMoney
    method: PaymentMethod
    description: trimmed(5, 500)  # type: ignore[valid-type]
