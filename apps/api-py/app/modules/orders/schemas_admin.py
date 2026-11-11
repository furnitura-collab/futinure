"""Buyurtma sxemalari: admin (shartlar, taklif, o'tish, ro'yxat)."""

import re
from typing import Annotated, Any, TypedDict

from pydantic import AfterValidator, BeforeValidator, Field, StrictBool, StrictInt

from app.core.schemas import Money, Schema, Uuid, custom_error, trimmed
from app.modules.orders.schemas_common import (
    PAYMENT_METHODS,
    IsoDate,
    Issue,
    OrderStatus,
    PageLimit,
    PageNo,
    PaymentMethod,
    PaymentTerms,
    _issue,
    zlist,
)

# ───────────── Admin: shartlar, taklif, o'tish ─────────────


def _methods(v: list[str]) -> list[str]:
    if len(set(v)) != len(v):
        raise custom_error("DUPLICATE_METHOD")
    return v


AllowedMethods = Annotated[zlist(PaymentMethod, 1, len(PAYMENT_METHODS)), AfterValidator(_methods)]


class TermsDict(TypedDict, total=False):
    """Shartlar — taklifda (changes.terms) JSON sifatida saqlanadigan ko'rinish (camelCase)"""

    paymentTerms: str
    advanceAmount: int
    allowedMethods: list[str]
    deliveryFee: int
    discountTotal: int
    deliveryDate: str | None
    vehicleType: str | None


class _TermsFields(Schema):
    """To'lov va yetkazish shartlari. PREPAID / ADVANCE / ON_DELIVERY / CREDIT"""

    payment_terms: PaymentTerms
    advance_amount: Money = 0
    allowed_methods: AllowedMethods
    delivery_fee: Money = 0
    discount_total: Money = 0
    delivery_date: IsoDate | None = None
    vehicle_type: trimmed(0, 20) | None = None  # type: ignore[valid-type]

    def terms(self) -> TermsDict:
        """pickTerms: yuborilmagan ixtiyoriy maydonlar (deliveryDate, vehicleType) kalit sifatida ham bo'lmaydi"""
        out: TermsDict = {
            "paymentTerms": self.payment_terms,
            "advanceAmount": self.advance_amount,
            "allowedMethods": list(self.allowed_methods),
            "deliveryFee": self.delivery_fee,
            "discountTotal": self.discount_total,
        }
        if "delivery_date" in self.model_fields_set:
            out["deliveryDate"] = self.delivery_date
        if "vehicle_type" in self.model_fields_set:
            out["vehicleType"] = self.vehicle_type
        return out


def terms_rule(v: dict[str, Any], prefix: str = "") -> list[Issue]:
    out = []
    terms, advance = v.get("paymentTerms"), v.get("advanceAmount", 0)
    if not isinstance(advance, (int, float)):
        return out
    if terms == "ADVANCE" and advance <= 0:
        out.append(_issue(f"{prefix}advanceAmount", "ADVANCE_AMOUNT_REQUIRED"))
    if terms != "ADVANCE" and advance > 0:
        out.append(_issue(f"{prefix}advanceAmount", "ADVANCE_ONLY_FOR_ADVANCE_TERMS"))
    return out


class OrderTermsInput(_TermsFields):
    pass


class SetTermsInput(Schema):
    """Yangi buyurtmaga shartlarni saqlash (status o'zgarmaydi)"""

    terms: OrderTermsInput
    expected_version: StrictInt | None = None


def set_terms_rule(v: dict[str, Any]) -> list[Issue]:
    terms = v.get("terms")
    return terms_rule(terms, "terms.") if isinstance(terms, dict) else []


class TransitionInput(Schema):
    to: OrderStatus
    comment: trimmed(0, 1000) | None = None  # type: ignore[valid-type]
    # Mijoz/menejer ko'rgan versiya. Boshqa birov orada o'zgartirgan bo'lsa — 409
    expected_version: StrictInt | None = None
    # NEW → PREPARING: shartlar hali saqlanmagan bo'lsa majburiy
    terms: OrderTermsInput | None = None
    # Kredit limitidan oshsa ham davom etish (izoh majburiy)
    override_credit_limit: StrictBool = False
    # Avans to'lanmagan bo'lsa ham ishlab chiqarishga berish (faqat super admin, izoh majburiy)
    override_advance: StrictBool = False
    # Olib ketishda tovarni kim qabul qildi
    receiver_name: trimmed(2, 120) | None = None  # type: ignore[valid-type]


def transition_rule(v: dict[str, Any]) -> list[Issue]:
    terms = v.get("terms")
    return terms_rule(terms, "terms.") if isinstance(terms, dict) else []


class AssignOrderInput(Schema):
    manager_id: Uuid | None


def _manager_filter(v: Any) -> str:
    if v == "none":
        return v
    if not isinstance(v, str) or not re.fullmatch(r"[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}", v):
        raise custom_error("Invalid UUID")
    return v.lower()


class AdminOrderListQuery(Schema):
    page: PageNo = 1
    limit: PageLimit = 20
    status: OrderStatus | None = None
    manager_id: Annotated[str, BeforeValidator(_manager_filter)] | None = None
    customer_id: Uuid | None = None
    # Buyurtma raqami, mijoz telefoni yoki ismi
    q: trimmed(2, 100) | None = None  # type: ignore[valid-type]
    date_from: IsoDate | None = Field(default=None, alias="from")
    date_to: IsoDate | None = Field(default=None, alias="to")
