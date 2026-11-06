"""Narx qoidalari — packages/shared/src/pricing.ts bilan bir xil."""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from app.domain.quantity import QTY_SCALE, QtyInput, to_milli

PriceReason = Literal["BASE", "TIER", "GROUP"]


@dataclass(frozen=True)
class PriceTier:
    min_qty: QtyInput
    price: int


@dataclass(frozen=True)
class ResolvedPrice:
    unit_price: int
    reason: PriceReason


def resolve_unit_price(
    base_price: int, qty: QtyInput, tiers: Sequence[PriceTier] = (), group_price: int | None = None
) -> ResolvedPrice:
    """
    Birlik narxini tanlash: asosiy narx, miqdorga mos pog'ona va guruh narxi
    ichidan eng arzoni. docs/01-er-diagram.md → "Narx tanlash qoidasi".
    """
    qty_milli = to_milli(qty) or 0
    best = ResolvedPrice(base_price, "BASE")
    for tier in tiers:
        mn = to_milli(tier.min_qty)
        if mn is not None and qty_milli >= mn and tier.price < best.unit_price:
            best = ResolvedPrice(tier.price, "TIER")
    if group_price is not None and group_price < best.unit_price:
        best = ResolvedPrice(group_price, "GROUP")
    return best


def line_total(qty: QtyInput, unit_price: int) -> int:
    """qty × narx, so'mga yaxlitlab (0.5 yuqoriga)"""
    milli = to_milli(qty)
    if milli is None:
        raise ValueError(f"Invalid qty: {qty}")
    return (milli * unit_price + QTY_SCALE // 2) // QTY_SCALE


@dataclass(frozen=True)
class OrderTotals:
    items_total: int
    services_total: int
    delivery_fee: int
    discount_total: int
    grand_total: int

    def as_dict(self) -> dict[str, int]:
        return {
            "itemsTotal": self.items_total,
            "servicesTotal": self.services_total,
            "deliveryFee": self.delivery_fee,
            "discountTotal": self.discount_total,
            "grandTotal": self.grand_total,
        }


def compute_order_totals(
    lines: Sequence[tuple[QtyInput, int]], services_total: int = 0, delivery_fee: int = 0, discount_total: int = 0
) -> OrderTotals:
    """lines: (qty, unit_price)"""
    items_total = sum(line_total(q, p) for q, p in lines)
    grand = max(0, items_total + services_total + delivery_fee - discount_total)
    return OrderTotals(items_total, services_total, delivery_fee, discount_total, grand)


def apply_percent(price: int, percent: float, round_to: int = 1) -> int:
    """Ommaviy narx o'zgartirish: foiz va yaxlitlash (masalan 1000 so'mga). JS Math.round bilan bir xil."""
    raw = (price * (100 + percent)) / 100
    return max(0, _js_round(raw / round_to) * round_to)


def _js_round(x: float) -> int:
    # JS Math.round: .5 har doim yuqoriga (Python round esa juftga)
    return math.floor(x + 0.5)
