"""
Narx va mavjudlikni hisoblashning yagona joyi.
Katalog, savat va buyurtma yaratish shu modulni ishlatadi.

    from app.modules.catalog.pricing import price_lines, LineIssue, PricedLine

    result = await price_lines(db, user_id, [(variant_id, "12.5")])
    result.lines[0].unit_price, result.lines[0].issues     # [{"code": "EXCEEDS_AVAILABLE", "available": "6"}]
    result.as_dict()                                       # JSON (Nest javobi bilan bir xil)
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.serialize import decimal_str
from app.domain.availability import StockLevel, available_milli, is_orderable, stock_level
from app.domain.pricing import PriceReason, PriceTier, ResolvedPrice, line_total, resolve_unit_price
from app.domain.quantity import from_milli, validate_qty
from app.models import CustomerProfile, Product, ProductVariant, VariantGroupPrice

# Muammo: {"code": "NOT_FOUND" | "INACTIVE" | "OUT_OF_STOCK"}
#        | {"code": QtyError, "minQty", "qtyStep"} | {"code": "EXCEEDS_AVAILABLE", "available"}
LineIssue = dict[str, str]


def variant_pricing_options(price_group_id: str | None, base: Any = None) -> list[Any]:
    """
    Narx hisoblash uchun variantni qanday yuklash kerak (variantPricingInclude).
    Guruhsiz mijozda guruh narxi umuman yuklanmaydi. `base` — ota yo'l (masalan selectinload(Product.variants)).
    """
    tiers = selectinload(ProductVariant.price_tiers)
    groups = selectinload(
        ProductVariant.group_prices.and_(VariantGroupPrice.price_group_id.in_([price_group_id] if price_group_id else []))
    )
    if base is None:
        return [tiers, groups]
    return [base.options(tiers, groups)]


def sorted_tiers(v: ProductVariant) -> list[Any]:
    """priceTiers: { orderBy: { minQty: 'asc' } }"""
    return sorted(v.price_tiers, key=lambda t: t.min_qty)


def group_price_of(v: ProductVariant) -> int | None:
    return v.group_prices[0].price if v.group_prices else None


def variant_stock_level(v: ProductVariant) -> StockLevel:
    return stock_level(v.stock_qty, v.reserved_qty, v.low_stock_threshold, v.availability == "ON_ORDER")


def price_of(v: ProductVariant, qty: str) -> ResolvedPrice:
    """Variant (variant_pricing_options bilan yuklangan) uchun birlik narxi"""
    return resolve_unit_price(
        v.base_price,
        qty,
        [PriceTier(decimal_str(t.min_qty), t.price) for t in sorted_tiers(v)],
        group_price_of(v),
    )


async def price_group_of(db: AsyncSession, user_id: str | None) -> str | None:
    """Mijozning narx guruhi. Mehmon va xodim uchun None — chakana narx"""
    if not user_id:
        return None
    return await db.scalar(select(CustomerProfile.price_group_id).where(CustomerProfile.user_id == user_id))


@dataclass
class PricedLine:
    variant_id: str
    qty: str
    sku: str | None = None
    product_id: str | None = None
    name_uz: str | None = None
    name_ru: str | None = None
    unit: str | None = None
    # Savatdagi kichik rasm (yoki kategoriya rangidagi belgi) uchun
    category_id: str | None = None
    kind: str | None = None
    image_url: str | None = None
    # Miqdor qoidalari — ilova +/- tugmalari uchun
    min_qty: str | None = None
    qty_step: str | None = None
    attributes: Any = None
    unit_price: int = 0
    base_price: int = 0
    price_reason: PriceReason | None = None
    line_total: int = 0
    stock_level: StockLevel | None = None
    lead_time_days: int | None = None
    weight_kg: float = 0
    volume_m3: float = 0
    issues: list[LineIssue] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "variantId": self.variant_id,
            "qty": self.qty,
            "sku": self.sku,
            "productId": self.product_id,
            "nameUz": self.name_uz,
            "nameRu": self.name_ru,
            "unit": self.unit,
            "categoryId": self.category_id,
            "kind": self.kind,
            "imageUrl": self.image_url,
            "minQty": self.min_qty,
            "qtyStep": self.qty_step,
            "attributes": self.attributes,
            "unitPrice": self.unit_price,
            "basePrice": self.base_price,
            "priceReason": self.price_reason,
            "lineTotal": self.line_total,
            "stockLevel": self.stock_level,
            "leadTimeDays": self.lead_time_days,
            "weightKg": self.weight_kg,
            "volumeM3": self.volume_m3,
            "issues": self.issues,
        }


@dataclass
class PricedLines:
    lines: list[PricedLine]
    items_total: int
    has_issues: bool
    total_weight_kg: float
    total_volume_m3: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "lines": [line.as_dict() for line in self.lines],
            "itemsTotal": self.items_total,
            "hasIssues": self.has_issues,
            "totalWeightKg": self.total_weight_kg,
            "totalVolumeM3": self.total_volume_m3,
        }


def round3(n: float) -> float:
    # JS: Math.round(n * 1000) / 1000
    return math.floor(n * 1000 + 0.5) / 1000


async def price_lines(db: AsyncSession, user_id: str | None, items: Sequence[tuple[str, str]]) -> PricedLines:
    """
    Qatorlarni narxlash. items: (variant_id, qty) — qty normallashgan satr ("12.5").
    Tranzaksiya ichida chaqirilsa o'sha tranzaksiyada o'qiydi (db — o'sha sessiya).
    """
    group_id = await price_group_of(db, user_id)
    variants = (
        await db.scalars(
            select(ProductVariant)
            .where(ProductVariant.id.in_([variant_id for variant_id, _ in items]))
            .options(
                *variant_pricing_options(group_id),
                selectinload(ProductVariant.product).selectinload(Product.images),
            )
            .execution_options(populate_existing=True)
        )
    ).all()
    by_id = {v.id: v for v in variants}

    lines: list[PricedLine] = []
    for variant_id, qty in items:
        v = by_id.get(variant_id)
        if v is None:
            lines.append(PricedLine(variant_id=variant_id, qty=qty, issues=[{"code": "NOT_FOUND"}]))
            continue
        issues: list[LineIssue] = []
        p = v.product
        if not v.is_active or not p.is_active:
            issues.append({"code": "INACTIVE"})

        rules = {"minQty": decimal_str(p.min_qty), "qtyStep": decimal_str(p.qty_step)}
        check = validate_qty(qty, min_qty=rules["minQty"], qty_step=rules["qtyStep"])
        if not check.ok:
            issues.append({"code": str(check.error), **rules})

        level = variant_stock_level(v)
        if not is_orderable(level):
            issues.append({"code": "OUT_OF_STOCK"})
        elif check.ok and v.availability != "ON_ORDER":
            # "Buyurtma asosida" tovar qoldiqdan ko'p ham buyurtma qilinadi
            available = available_milli(v.stock_qty, v.reserved_qty)
            if check.milli > available:
                issues.append({"code": "EXCEEDS_AVAILABLE", "available": from_milli(available)})

        price = price_of(v, qty)
        qty_num = float(qty)
        lines.append(
            PricedLine(
                variant_id=v.id,
                qty=qty,
                sku=v.sku,
                product_id=p.id,
                name_uz=p.name_uz,
                name_ru=p.name_ru,
                unit=p.unit,
                category_id=p.category_id,
                kind=p.kind,
                image_url=p.images[0].url if p.images else None,
                min_qty=rules["minQty"],
                qty_step=rules["qtyStep"],
                attributes=v.attributes,
                unit_price=price.unit_price,
                base_price=v.base_price,
                price_reason=price.reason,
                line_total=line_total(qty, price.unit_price),
                stock_level=level,
                lead_time_days=v.lead_time_days,
                weight_kg=round3(float(p.weight_kg or 0) * qty_num),
                volume_m3=round3(float(p.volume_m3 or 0) * qty_num),
                issues=issues,
            )
        )

    return PricedLines(
        lines=lines,
        items_total=sum(line.line_total for line in lines),
        has_issues=any(line.issues for line in lines),
        total_weight_kg=round3(sum((line.weight_kg for line in lines), 0.0)),
        total_volume_m3=round3(sum((line.volume_m3 for line in lines), 0.0)),
    )
