"""Savat sxemalari — packages/shared/src/schemas/orders.ts (savat qismi)"""

from typing import Annotated

from pydantic import Field

from app.core.schemas import PositiveQty, Schema, trimmed

CART_MAX_ITEMS = 200


class CartItemInput(Schema):
    qty: PositiveQty


class CartBulkItem(Schema):
    sku: trimmed(1, 64)  # type: ignore[valid-type]
    qty: PositiveQty


class CartBulkAddInput(Schema):
    """SKU bo'yicha tez qo'shish: "KR-W980-16 — 12" """

    items: Annotated[list[CartBulkItem], Field(min_length=1, max_length=100)]
