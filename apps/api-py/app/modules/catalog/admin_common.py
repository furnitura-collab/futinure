"""Admin katalogi: umumiy yordamchilar (Decimal ustunlar, variant ko'rinishi)."""

from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError
from app.core.serialize import pick
from app.models import ProductVariant, VariantGroupPrice
from app.modules.catalog.pricing import sorted_tiers, variant_stock_level

# Miqdor ustunlari — bazaga Decimal bo'lib yoziladi
DECIMAL_FIELDS = {"min_qty", "qty_step", "weight_kg", "volume_m3", "thickness_mm", "low_stock_threshold"}


def to_db(data: dict[str, Any]) -> dict[str, Any]:
    return {k: (Decimal(str(v)) if k in DECIMAL_FIELDS and v is not None else v) for k, v in data.items()}


def record_not_found() -> AppError:
    """Prisma P2025 (update/delete — yozuv yo'q)"""
    return AppError("NOT_FOUND", "Yozuv topilmadi", 404)


def admin_variant_options() -> list[Any]:
    return [
        selectinload(ProductVariant.price_tiers),
        selectinload(ProductVariant.group_prices).selectinload(VariantGroupPrice.price_group),
    ]


def present_variant(v: ProductVariant) -> dict[str, Any]:
    """Admin variant ko'rinishi: aniq qoldiq, band va mavjud"""
    return {
        **pick(
            v,
            "id",
            "sku",
            "attributes",
            "swatch_url",
            "base_price",
            "stock_qty",
            "reserved_qty",
            "low_stock_threshold",
            "availability",
            "lead_time_days",
            "is_active",
            "updated_at",
        ),
        "priceTiers": [pick(t, "min_qty", "price") for t in sorted_tiers(v)],
        "groupPrices": [pick(g, "price_group_id", "price", priceGroup={"name": g.price_group.name}) for g in v.group_prices],
        "availableQty": v.stock_qty - v.reserved_qty,
        "onOrder": v.availability == "ON_ORDER",
        "stockLevel": variant_stock_level(v),
    }


async def _variants_by_product(db: AsyncSession, product_ids: list[str]) -> dict[str, list[ProductVariant]]:
    """variants: { orderBy: { sku: 'asc' }, select: adminVariantSelect }"""
    rows = (
        await db.scalars(
            select(ProductVariant)
            .where(ProductVariant.product_id.in_(product_ids))
            .order_by(ProductVariant.sku)
            .options(*admin_variant_options())
            .execution_options(populate_existing=True)
        )
    ).all()
    out: dict[str, list[ProductVariant]] = {pid: [] for pid in product_ids}
    for v in rows:
        out[v.product_id].append(v)
    return out
