"""
Ommaviy narx o'zgartirish (masalan dollar kursi oshganda +5%).
dry_run=True — faqat natijani ko'rsatadi. Asosiy narx, pog'onalar va guruh narxlari
bir xil foizga o'zgaradi, aks holda "chegirma" narxlar asosiy narxdan qimmat bo'lib qolishi mumkin.
"""

from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.db import transaction
from app.domain.pricing import apply_percent
from app.models import PriceHistory, Product, ProductVariant, VariantGroupPrice, VariantPriceTier, utcnow
from app.modules.catalog.category_tree import category_with_descendants
from app.modules.catalog.schemas import BulkPriceInput
from app.services.audit import audit

PREVIEW_LIMIT = 200


async def run(db: AsyncSession, body: BulkPriceInput, actor: AuthUser) -> dict[str, Any]:
    if not body.category_id and not body.brand_id:
        raise AppError("FILTER_REQUIRED", "Kategoriya yoki brend tanlang")
    stmt = select(ProductVariant).join(Product, Product.id == ProductVariant.product_id)
    if body.category_id:
        stmt = stmt.where(Product.category_id.in_(await category_with_descendants(db, body.category_id)))
    if body.brand_id:
        stmt = stmt.where(Product.brand_id == body.brand_id)
    variants = (
        await db.scalars(
            stmt.order_by(ProductVariant.sku)
            .options(
                selectinload(ProductVariant.product),
                selectinload(ProductVariant.price_tiers),
                selectinload(ProductVariant.group_prices),
            )
            .execution_options(populate_existing=True)
        )
    ).all()

    def calc(price: int) -> int:
        return apply_percent(price, body.percent, body.round_to)

    changes = [(v, calc(v.base_price)) for v in variants]
    summary = {
        "percent": body.percent,
        "roundTo": body.round_to,
        "variantCount": len(changes),
        "oldTotal": sum(v.base_price for v, _ in changes),
        "newTotal": sum(new for _, new in changes),
    }
    preview = [
        {"variantId": v.id, "sku": v.sku, "name": v.product.name_uz, "oldPrice": v.base_price, "newPrice": new}
        for v, new in changes[:PREVIEW_LIMIT]
    ]

    if body.dry_run:
        return {"dryRun": True, "summary": summary, "preview": preview}

    async with transaction(db):
        for v, new in changes:
            # Eski qiymatlar UPDATE sessiyadagi obyektlarni yangilashidan oldin olinadi
            tiers = [(t.id, t.price) for t in v.price_tiers]
            groups = [(g.price_group_id, g.price) for g in v.group_prices]
            old = v.base_price
            if new != old:
                await db.execute(
                    update(ProductVariant).where(ProductVariant.id == v.id).values(base_price=new, updated_at=utcnow())
                )
                db.add(PriceHistory(variant_id=v.id, old_price=old, new_price=new, source="BULK", changed_by=actor.id))
            if body.include_tiers:
                for tier_id, price in tiers:
                    await db.execute(update(VariantPriceTier).where(VariantPriceTier.id == tier_id).values(price=calc(price)))
            if body.include_group_prices:
                for group_id, price in groups:
                    await db.execute(
                        update(VariantGroupPrice)
                        .where(VariantGroupPrice.variant_id == v.id, VariantGroupPrice.price_group_id == group_id)
                        .values(price=calc(price))
                    )
        await audit(
            db,
            actor_id=actor.id,
            entity="catalog",
            entity_id="bulk-price",
            action="bulk_price_update",
            after={"input": body.as_json(), "summary": summary},
        )
    return {"dryRun": False, "summary": summary, "preview": preview}
