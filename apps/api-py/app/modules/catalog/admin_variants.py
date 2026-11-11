"""Admin katalogi: variantlar, narx pog'onalari va narx tarixi."""

from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import row
from app.db import transaction
from app.models import (
    OrderItem,
    PriceGroup,
    PriceHistory,
    Product,
    ProductVariant,
    StockMovement,
    VariantGroupPrice,
    VariantPriceTier,
    utcnow,
)
from app.modules.catalog.admin_common import admin_variant_options, present_variant, to_db
from app.modules.catalog.schemas import GroupPriceInput, PriceTierInput, VariantInput, VariantUpdate
from app.services.audit import audit

# ───────────── Variantlar ─────────────


def _variant_data(data: dict[str, Any]) -> dict[str, Any]:
    """onOrder → availability; qolganlari o'zgarishsiz"""
    out = to_db({k: v for k, v in data.items() if k != "on_order"})
    if "on_order" in data and data["on_order"] is not None:
        out["availability"] = "ON_ORDER" if data["on_order"] else "IN_STOCK"
    return out


async def create_variant(db: AsyncSession, product_id: str, body: VariantInput, actor: AuthUser) -> dict[str, Any]:
    if not await db.scalar(select(Product.id).where(Product.id == product_id)):
        raise AppError.not_found("Mahsulot")
    async with transaction(db):
        v = ProductVariant(**_variant_data(body.data()), product_id=product_id)
        db.add(v)
        await db.flush()
        await audit(db, actor_id=actor.id, entity="variant", entity_id=v.id, action="create", after=v)
    return await variant(db, v.id)


async def variant(db: AsyncSession, id_: str) -> dict[str, Any]:
    v = await db.scalar(
        select(ProductVariant)
        .where(ProductVariant.id == id_)
        .options(*admin_variant_options())
        .execution_options(populate_existing=True)
    )
    if not v:
        raise AppError.not_found("Variant")
    return present_variant(v)


async def update_variant(db: AsyncSession, id_: str, body: VariantUpdate, actor: AuthUser) -> dict[str, Any]:
    data = body.data()
    base_price = data.pop("base_price", None)
    async with transaction(db):
        v = await db.get(ProductVariant, id_, populate_existing=True)
        if not v:
            raise AppError.not_found("Variant")
        before = row(v)
        changes = _variant_data(data)
        if base_price is not None and base_price != v.base_price:
            changes["base_price"] = base_price
            db.add(
                PriceHistory(variant_id=id_, old_price=v.base_price, new_price=base_price, source="MANUAL", changed_by=actor.id)
            )
        for k, val in changes.items():
            setattr(v, k, val)
        v.updated_at = utcnow()
        await db.flush()
        await audit(db, actor_id=actor.id, entity="variant", entity_id=id_, action="update", before=before, after=v)
    return await variant(db, id_)


async def delete_variant(db: AsyncSession, id_: str, actor: AuthUser) -> None:
    v = await db.get(ProductVariant, id_, populate_existing=True)
    if not v:
        raise AppError.not_found("Variant")
    before = row(v)
    if await db.scalar(select(func.count()).select_from(OrderItem).where(OrderItem.variant_id == id_)):
        raise AppError("VARIANT_IN_USE", "Variant buyurtmalarda bor. O'chirish o'rniga nofaol qiling", 409)
    async with transaction(db):
        await db.execute(delete(StockMovement).where(StockMovement.variant_id == id_))
        await db.execute(delete(ProductVariant).where(ProductVariant.id == id_))
        await audit(db, actor_id=actor.id, entity="variant", entity_id=id_, action="delete", before=before)
    db.expunge(v)


async def _variant_exists(db: AsyncSession, id_: str) -> bool:
    return bool(await db.scalar(select(func.count()).select_from(ProductVariant).where(ProductVariant.id == id_)))


async def set_price_tiers(db: AsyncSession, variant_id: str, tiers: list[PriceTierInput], actor: AuthUser) -> dict[str, Any]:
    async with transaction(db):
        before = [
            row(t) for t in (await db.scalars(select(VariantPriceTier).where(VariantPriceTier.variant_id == variant_id))).all()
        ]
        if not await _variant_exists(db, variant_id):
            raise AppError.not_found("Variant")
        await db.execute(delete(VariantPriceTier).where(VariantPriceTier.variant_id == variant_id))
        if tiers:
            await db.execute(
                insert(VariantPriceTier),
                [{"variant_id": variant_id, "min_qty": Decimal(t.min_qty), "price": t.price} for t in tiers],
            )
        await audit(
            db,
            actor_id=actor.id,
            entity="variant",
            entity_id=variant_id,
            action="set_price_tiers",
            before=before,
            after=[{"minQty": t.min_qty, "price": t.price} for t in tiers],
        )
    return await variant(db, variant_id)


async def set_group_prices(db: AsyncSession, variant_id: str, prices: list[GroupPriceInput], actor: AuthUser) -> dict[str, Any]:
    async with transaction(db):
        if not await _variant_exists(db, variant_id):
            raise AppError.not_found("Variant")
        groups = await db.scalar(
            select(func.count()).select_from(PriceGroup).where(PriceGroup.id.in_([p.price_group_id for p in prices]))
        )
        if groups != len(prices):
            raise AppError.not_found("Narx guruhi")
        before = [
            row(g) for g in (await db.scalars(select(VariantGroupPrice).where(VariantGroupPrice.variant_id == variant_id))).all()
        ]
        await db.execute(delete(VariantGroupPrice).where(VariantGroupPrice.variant_id == variant_id))
        if prices:
            await db.execute(
                insert(VariantGroupPrice),
                [{"variant_id": variant_id, "price_group_id": p.price_group_id, "price": p.price} for p in prices],
            )
        await audit(
            db,
            actor_id=actor.id,
            entity="variant",
            entity_id=variant_id,
            action="set_group_prices",
            before=before,
            after=[{"priceGroupId": p.price_group_id, "price": p.price} for p in prices],
        )
    return await variant(db, variant_id)


async def price_history(db: AsyncSession, variant_id: str) -> list[PriceHistory]:
    return list(
        (
            await db.scalars(
                select(PriceHistory)
                .where(PriceHistory.variant_id == variant_id)
                .order_by(PriceHistory.created_at.desc())
                .limit(100)
            )
        ).all()
    )
