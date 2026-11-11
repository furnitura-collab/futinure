"""Excel import: o'zgarishlarni saqlash."""

from decimal import Decimal
from typing import Any

from sqlalchemy import delete, insert, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.db import transaction
from app.domain.quantity import to_milli
from app.models import Brand, PriceHistory, Product, ProductVariant, StockMovement, VariantGroupPrice, VariantPriceTier, utcnow
from app.modules.catalog.excel_diff import _product_input
from app.modules.catalog.excel_plan import Context, ProductPlan, VariantRow
from app.services.audit import audit

# ───────────── Saqlash ─────────────


def _product_columns(input: dict[str, Any], code: str) -> dict[str, Any]:
    return {
        "category_id": input["categoryId"],
        "brand_id": input["brandId"],
        "name_uz": input["nameUz"],
        "name_ru": input["nameRu"],
        "unit": input["unit"],
        "kind": input["kind"],
        "min_qty": Decimal(input["minQty"]),
        "qty_step": Decimal(input["qtyStep"]),
        "weight_kg": None if input["weightKg"] is None else Decimal(input["weightKg"]),
        "volume_m3": None if input["volumeM3"] is None else Decimal(str(input["volumeM3"])),
        "board_length_mm": input["boardLengthMm"],
        "board_width_mm": input["boardWidthMm"],
        "thickness_mm": None if input["thicknessMm"] is None else Decimal(str(input["thicknessMm"])),
        "code": code,
    }


async def _apply(db: AsyncSession, plans: list[ProductPlan], ctx: Context, summary: dict[str, Any], actor: AuthUser) -> None:
    async with transaction(db):
        for name in summary["brandsCreated"]:
            brand = Brand(name=name)
            db.add(brand)
            await db.flush()
            ctx.brand_by_name[name.lower()] = brand.id

        for plan in plans:
            columns = _product_columns(_product_input(plan, ctx), plan.code)
            existing = ctx.product_by_code.get(plan.code)
            if existing is not None:
                for k, v in columns.items():
                    setattr(existing, k, v)
                existing.updated_at = utcnow()
                product = existing
            else:
                product = Product(**columns)
                db.add(product)
            await db.flush()

            for v in plan.variants:
                await _apply_variant(db, product.id, v, ctx, actor)

        await audit(db, actor_id=actor.id, entity="catalog", entity_id="import", action="excel_import", after=summary)


async def _apply_variant(db: AsyncSession, product_id: str, v: VariantRow, ctx: Context, actor: AuthUser) -> None:
    existing = ctx.variant_by_sku.get(v.sku.upper())
    base: dict[str, Any] = {"attributes": v.attributes, "base_price": v.base_price, "is_active": v.is_active}
    if v.low_stock is not None:
        base["low_stock_threshold"] = Decimal(v.low_stock)
    if v.lead_time_days is not None:
        base["lead_time_days"] = v.lead_time_days
    if v.on_order is not None:
        base["availability"] = "ON_ORDER" if v.on_order else "IN_STOCK"

    if existing is None:
        created = ProductVariant(**base, product_id=product_id, sku=v.sku)
        db.add(created)
        await db.flush()
        variant_id = created.id
        if v.stock and (to_milli(v.stock) or 0) > 0:
            created.stock_qty = Decimal(v.stock)
            db.add(
                StockMovement(
                    variant_id=variant_id,
                    type="IN",
                    qty=Decimal(v.stock),
                    reason="Excel import (boshlang'ich qoldiq)",
                    user_id=actor.id,
                )
            )
            await db.flush()
    else:
        variant_id = existing.id
        # Eski qiymatlar — o'zgartirishdan oldin
        old_price, old_stock = existing.base_price, existing.stock_qty
        for k, val in base.items():
            setattr(existing, k, val)
        existing.updated_at = utcnow()
        await db.flush()
        if old_price != v.base_price:
            db.add(
                PriceHistory(
                    variant_id=variant_id, old_price=old_price, new_price=v.base_price, source="IMPORT", changed_by=actor.id
                )
            )
        if v.stock is not None and old_stock != Decimal(v.stock):
            delta = Decimal(v.stock) - old_stock
            # Import va buyurtma bir vaqtda rezervni o'zgartirsa ham CHECK cheklovi himoya qiladi
            await db.execute(
                update(ProductVariant)
                .where(ProductVariant.id == variant_id)
                .values(stock_qty=ProductVariant.stock_qty + delta, updated_at=utcnow())
            )
            db.add(
                StockMovement(
                    variant_id=variant_id, type="ADJUST", qty=delta, reason="Excel import (inventarizatsiya)", user_id=actor.id
                )
            )
        await db.flush()

    if v.tiers is not None:
        await db.execute(delete(VariantPriceTier).where(VariantPriceTier.variant_id == variant_id))
        if v.tiers:
            await db.execute(
                insert(VariantPriceTier),
                [{"variant_id": variant_id, "min_qty": Decimal(q), "price": p} for q, p in v.tiers],
            )
    for name, price in v.group_prices.items():
        price_group_id = ctx.group_by_name[name.lower()]
        if price is None:
            await db.execute(
                delete(VariantGroupPrice).where(
                    VariantGroupPrice.variant_id == variant_id, VariantGroupPrice.price_group_id == price_group_id
                )
            )
        else:
            stmt = pg_insert(VariantGroupPrice).values(variant_id=variant_id, price_group_id=price_group_id, price=price)
            await db.execute(
                stmt.on_conflict_do_update(
                    index_elements=[VariantGroupPrice.variant_id, VariantGroupPrice.price_group_id], set_={"price": price}
                )
            )
