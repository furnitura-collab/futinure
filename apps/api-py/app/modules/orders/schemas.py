"""
Buyurtma sxemalari — packages/shared/src/schemas/orders.ts va admin-orders.ts nusxasi.

Zod superRefine qoidalari (yo'li bilan) Pydantic'da yo'q — shuning uchun tana `body_of(Model, rule)`
dependency orqali o'qiladi: rule(xom JSON) → muammolar. Zod 4 kabi: refine faqat "tip" xatosi bo'lmasa ishlaydi,
asosiy xatolar bilan birga qaytariladi.
"""

from typing import Annotated, Any

from pydantic import BeforeValidator

from app.core.schemas import Schema, Uuid, custom_error, trimmed
from app.modules.orders.schemas_admin import (
    AdminOrderListQuery,
    AllowedMethods,
    AssignOrderInput,
    OrderTermsInput,
    SetTermsInput,
    TermsDict,
    TransitionInput,
    set_terms_rule,
    terms_rule,
    transition_rule,
)
from app.modules.orders.schemas_common import (
    DELIVERY_TYPES,
    IDEMPOTENCY_KEY_RE,
    MAX_DELIVERY_DAYS_AHEAD,
    ORDER_STATUSES,
    PAYMENT_METHODS,
    PAYMENT_TERMS,
    DeliveryType,
    IsoDate,
    Issue,
    OrderStatus,
    PageLimit,
    PageNo,
    PaymentMethod,
    PaymentTerms,
    Rule,
    _issue,
    body_of,
    zcoerce_int,
    zenum,
    zlist,
)

__all__ = [
    "CreateOrderInput",
    "create_order_rule",
    "OrderListQuery",
    "CancelOrderInput",
    "IDEMPOTENCY_KEY_RE",
    "MAX_DELIVERY_DAYS_AHEAD",
    "ORDER_STATUSES",
    "DELIVERY_TYPES",
    "PAYMENT_TERMS",
    "PAYMENT_METHODS",
    "Issue",
    "Rule",
    "zenum",
    "zlist",
    "zcoerce_int",
    "OrderStatus",
    "DeliveryType",
    "PaymentTerms",
    "PaymentMethod",
    "PageNo",
    "PageLimit",
    "IsoDate",
    "body_of",
    "AllowedMethods",
    "TermsDict",
    "terms_rule",
    "OrderTermsInput",
    "SetTermsInput",
    "set_terms_rule",
    "TransitionInput",
    "transition_rule",
    "AssignOrderInput",
    "AdminOrderListQuery",
]


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
