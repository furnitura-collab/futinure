"""
Buyurtma sxemalari — packages/shared/src/schemas/orders.ts va admin-orders.ts nusxasi.

Zod superRefine qoidalari (yo'li bilan) Pydantic'da yo'q — shuning uchun tana `body_of(Model, rule)`
dependency orqali o'qiladi: rule(xom JSON) → muammolar. Zod 4 kabi: refine faqat "tip" xatosi bo'lmasa ishlaydi,
asosiy xatolar bilan birga qaytariladi.
"""

import re
from collections.abc import Callable
from typing import Annotated, Any, TypedDict

from fastapi import Body
from pydantic import AfterValidator, BaseModel, BeforeValidator, Field, StrictBool, StrictInt, ValidationError

from app.core.errors import AppError, validation_details
from app.core.schemas import Money, PositiveQty, Qty, Schema, Uuid, custom_error, trimmed

IDEMPOTENCY_KEY_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
MAX_DELIVERY_DAYS_AHEAD = 60

ORDER_STATUSES = ("NEW", "QUOTED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED", "CANCELLED")
DELIVERY_TYPES = ("DELIVERY", "PICKUP")
PAYMENT_TERMS = ("PREPAID", "ADVANCE", "ON_DELIVERY", "CREDIT")
PAYMENT_METHODS = ("CASH", "CARD_TRANSFER", "CLICK", "PAYME", "BANK_TRANSFER")

QUOTE_LINE_ACTIONS = ("KEEP", "CHANGE", "REMOVE", "REPLACE", "ADD")

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


# ───────────── Mijoz: buyurtma ─────────────


class CreateOrderInput(Schema):
    delivery_type: DeliveryType
    address_id: Uuid | None = None
    warehouse_id: Uuid | None = None
    # Mijoz xohlagan sana. Yakuniy sanani menejer taklifda belgilaydi
    delivery_date: IsoDate | None = None
    comment: trimmed(0, 1000) | None = None  # type: ignore[valid-type]


def create_order_rule(v: dict[str, Any]) -> list[Issue]:
    out = []
    if v.get("deliveryType") == "DELIVERY" and not v.get("addressId"):
        out.append(_issue("addressId", "ADDRESS_REQUIRED"))
    if v.get("deliveryType") == "PICKUP" and not v.get("warehouseId"):
        out.append(_issue("warehouseId", "WAREHOUSE_REQUIRED"))
    return out


def _active(v: Any) -> bool:
    if v not in ("true", "false"):
        raise custom_error('Invalid option: expected one of "true"|"false"')
    return v == "true"


class OrderListQuery(Schema):
    page: PageNo = 1
    limit: PageLimit = 20
    status: OrderStatus | None = None
    # true — faqat faol (yakunlanmagan) buyurtmalar
    active: Annotated[bool, BeforeValidator(_active)] | None = None


class CancelOrderInput(Schema):
    reason: trimmed(3, 500)  # type: ignore[valid-type]


class RejectQuoteInput(Schema):
    comment: trimmed(3, 1000)  # type: ignore[valid-type]


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


class ItemChange(Schema):
    item_id: Uuid
    # qty=0 — qatorni olib tashlash
    qty: Qty
    unit_price: Money | None = None


class Replacement(Schema):
    item_id: Uuid
    variant_id: Uuid
    qty: PositiveQty
    unit_price: Money | None = None


class Addition(Schema):
    variant_id: Uuid
    qty: PositiveQty
    unit_price: Money | None = None


class QuoteInput(_TermsFields):
    # Mavjud qatorni o'zgartirish. qty=0 — qatorni olib tashlash
    item_changes: zlist(ItemChange, 0, 200) = []  # type: ignore[valid-type]
    # Yo'q tovar o'rniga analog
    replacements: zlist(Replacement, 0, 200) = []  # type: ignore[valid-type]
    # Yangi tovar qo'shish (masalan, plitaga mos kromka)
    additions: zlist(Addition, 0, 200) = []  # type: ignore[valid-type]
    note: trimmed(0, 1000) | None = None  # type: ignore[valid-type]
    expires_in_hours: Annotated[StrictInt, Field(ge=1, le=168)] | None = None
    expected_version: StrictInt | None = None


def _item_ids(v: dict[str, Any], key: str) -> list[Any]:
    rows = v.get(key)
    return [r.get("itemId") for r in rows if isinstance(r, dict)] if isinstance(rows, list) else []


def quote_rule(v: dict[str, Any]) -> list[Issue]:
    out = terms_rule(v)
    ids = _item_ids(v, "itemChanges") + _item_ids(v, "replacements")
    if len(set(map(str, ids))) != len(ids):
        out.append(_issue("itemChanges", "ITEM_CHANGED_TWICE"))
    return out


class TransitionInput(Schema):
    to: OrderStatus
    comment: trimmed(0, 1000) | None = None  # type: ignore[valid-type]
    # Mijoz/menejer ko'rgan versiya. Boshqa birov orada o'zgartirgan bo'lsa — 409
    expected_version: StrictInt | None = None
    # NEW → CONFIRMED uchun majburiy
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
