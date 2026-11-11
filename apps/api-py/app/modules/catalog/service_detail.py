"""Mijoz katalogi: kategoriya/brend, mahsulot sahifasi, qayta xarid, narx hisobi."""

from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError
from app.core.serialize import decimal_str, pick
from app.models import Brand, Category, Order, OrderItem, Product, ProductVariant
from app.modules.catalog.category_tree import build_tree
from app.modules.catalog.pricing import (
    group_price_of,
    price_group_of,
    price_lines,
    price_of,
    sorted_tiers,
    variant_pricing_options,
    variant_stock_level,
)
from app.modules.catalog.schemas import PricingQuoteInput
from app.modules.catalog.service_products import cards

BUY_AGAIN_LIMIT = 12


async def categories(db: AsyncSession) -> list[dict[str, Any]]:
    rows = (
        await db.scalars(select(Category).where(Category.is_active.is_(True)).order_by(Category.sort_order, Category.name_uz))
    ).all()
    # Faol bo'lmagan ota-onaning bolalari ham ko'rinmasin
    active_ids = {r.id for r in rows}
    direct = await db.execute(
        text("""
      SELECT p.category_id, COUNT(*) AS n FROM products p
      WHERE p.is_active AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active)
      GROUP BY p.category_id""")
    )
    own = {str(r.category_id): int(r.n) for r in direct}
    tree = build_tree(
        [
            pick(r, "id", "parent_id", "name_uz", "name_ru", "slug", "image_url", productCount=own.get(r.id, 0))
            for r in rows
            if not r.parent_id or r.parent_id in active_ids
        ]
    )

    # Ota kategoriya soni ichidagilarni ham o'z ichiga oladi (katalog filtri ham shunday ishlaydi)
    def total(n: dict[str, Any]) -> int:
        n["productCount"] += sum(total(c) for c in n["children"])
        return n["productCount"]

    for n in tree:
        total(n)
    return tree


async def brands(db: AsyncSession) -> list[dict[str, Any]]:
    rows = (await db.scalars(select(Brand).order_by(Brand.name))).all()
    return [pick(b, "id", "name", "logo_url") for b in rows]


async def detail(db: AsyncSession, id_: str, user_id: str | None) -> dict[str, Any]:
    group_id = await price_group_of(db, user_id)
    p = await db.scalar(
        select(Product)
        .join(Category, Category.id == Product.category_id)
        .where(Product.id == id_, Product.is_active.is_(True), Category.is_active.is_(True))
        .options(selectinload(Product.brand), selectinload(Product.category), selectinload(Product.images))
        .execution_options(populate_existing=True)
    )
    variants = (
        (
            await db.scalars(
                select(ProductVariant)
                .where(ProductVariant.product_id == id_, ProductVariant.is_active.is_(True))
                .order_by(ProductVariant.sku)
                .options(*variant_pricing_options(group_id))
                .execution_options(populate_existing=True)
            )
        ).all()
        if p
        else []
    )
    if p is None or not variants:
        raise AppError.not_found("Mahsulot")

    min_qty = decimal_str(p.min_qty)

    def variant_json(v: ProductVariant) -> dict[str, Any]:
        group_price = group_price_of(v)
        return {
            "id": v.id,
            "sku": v.sku,
            "attributes": v.attributes,
            "swatchUrl": v.swatch_url,
            "basePrice": v.base_price,
            "price": price_of(v, min_qty).unit_price,
            "groupPrice": group_price,
            # Pog'onalar faqat shaxsiy narxdan arzon bo'lsa ko'rsatiladi
            "tiers": [
                {"minQty": t.min_qty, "price": t.price} for t in sorted_tiers(v) if group_price is None or t.price < group_price
            ],
            "stockLevel": variant_stock_level(v),
            "leadTimeDays": v.lead_time_days if v.availability == "ON_ORDER" else None,
        }

    return {
        "id": p.id,
        "nameUz": p.name_uz,
        "nameRu": p.name_ru,
        "descriptionUz": p.description_uz,
        "descriptionRu": p.description_ru,
        "unit": p.unit,
        "kind": p.kind,
        "minQty": p.min_qty,
        "qtyStep": p.qty_step,
        "weightKg": p.weight_kg,
        "board": (
            {"lengthMm": p.board_length_mm, "widthMm": p.board_width_mm, "thicknessMm": p.thickness_mm}
            if p.kind == "BOARD"
            else None
        ),
        "brand": p.brand and pick(p.brand, "id", "name", "logo_url"),
        "category": pick(p.category, "id", "name_uz", "name_ru", "slug", "parent_id"),
        "images": [pick(i, "id", "url") for i in p.images],
        "variants": [variant_json(v) for v in variants],
    }


async def by_sku(db: AsyncSession, sku: str, user_id: str | None) -> dict[str, Any]:
    v = (
        await db.execute(
            select(ProductVariant.id, ProductVariant.product_id)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(
                func.lower(ProductVariant.sku) == sku.strip().lower(),
                ProductVariant.is_active.is_(True),
                Product.is_active.is_(True),
            )
            .limit(1)
        )
    ).first()
    if not v:
        raise AppError.not_found("Artikul")
    product = await detail(db, v.product_id, user_id)
    return {"variantId": v.id, "product": product}


async def buy_again(db: AsyncSession, user_id: str) -> list[dict[str, Any]]:
    """Mijoz avval buyurtma qilgan, hozir ham sotuvdagi variantlar — eng so'nggisi birinchi"""
    rows = (
        await db.execute(
            select(OrderItem.variant_id, OrderItem.qty, OrderItem.created_at)
            .join(Order, Order.id == OrderItem.order_id)
            .join(ProductVariant, ProductVariant.id == OrderItem.variant_id)
            .join(Product, Product.id == ProductVariant.product_id)
            .join(Category, Category.id == Product.category_id)
            .where(
                OrderItem.status == "ACTIVE",
                Order.customer_id == user_id,
                Order.status != "CANCELLED",
                ProductVariant.is_active.is_(True),
                Product.is_active.is_(True),
                Category.is_active.is_(True),
            )
            .order_by(OrderItem.created_at.desc())
            .limit(200)
        )
    ).all()
    seen: set[str] = set()
    latest = []
    for r in rows:
        if r.variant_id not in seen:
            seen.add(r.variant_id)
            latest.append(r)
    latest = latest[:BUY_AGAIN_LIMIT]
    if not latest:
        return []

    group_id = await price_group_of(db, user_id)
    variants = (
        await db.scalars(
            select(ProductVariant)
            .where(ProductVariant.id.in_([r.variant_id for r in latest]))
            .options(*variant_pricing_options(group_id))
            .execution_options(populate_existing=True)
        )
    ).all()
    by_id = {v.id: v for v in variants}
    card_list = await cards(db, list(dict.fromkeys(v.product_id for v in variants)), user_id)
    card_by_id = {c["id"]: c for c in card_list}

    out = []
    for r in latest:
        v = by_id.get(r.variant_id)
        product = card_by_id.get(v.product_id) if v else None
        if not v or not product:
            continue
        last_qty = decimal_str(r.qty)
        out.append(
            {
                "variantId": v.id,
                "sku": v.sku,
                "attributes": v.attributes,
                "lastQty": last_qty,
                "lastOrderedAt": r.created_at,
                "unitPrice": price_of(v, last_qty).unit_price,
                "stockLevel": variant_stock_level(v),
                "product": product,
            }
        )
    return out


async def quote(db: AsyncSession, body: PricingQuoteInput, user_id: str | None) -> dict[str, Any]:
    result = await price_lines(db, user_id, [(i.variant_id, i.qty) for i in body.items])
    return result.as_dict()
