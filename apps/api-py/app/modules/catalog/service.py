"""Mijoz katalogi"""

from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.errors import AppError
from app.core.serialize import decimal_str, pick
from app.domain.availability import StockLevel, is_orderable
from app.models import Brand, Category, Order, OrderItem, Product, ProductVariant
from app.modules.catalog.category_tree import build_tree, category_with_descendants
from app.modules.catalog.pricing import (
    group_price_of,
    price_group_of,
    price_lines,
    price_of,
    sorted_tiers,
    variant_pricing_options,
    variant_stock_level,
)
from app.modules.catalog.schemas import PricingQuoteInput, ProductListQuery

LEVEL_RANK: dict[StockLevel, int] = {"IN_STOCK": 3, "LOW": 2, "ON_ORDER": 1, "OUT_OF_STOCK": 0}
FUZZY_THRESHOLD = 0.45
FUZZY_MIN_LENGTH = 4
BUY_AGAIN_LIMIT = 12


def like_pattern(q: str) -> str:
    """LIKE uchun maxsus belgilarni ekranlash"""
    return "%" + "".join(f"\\{c}" if c in "\\%_" else c for c in q) + "%"


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


async def list_products(db: AsyncSession, query: ProductListQuery, user_id: str | None) -> dict[str, Any]:
    where = [
        "p.is_active = true",
        "EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active)",
        "EXISTS (SELECT 1 FROM categories c WHERE c.id = p.category_id AND c.is_active)",
    ]
    params: dict[str, Any] = {}
    if query.category_id:
        params["category_ids"] = await category_with_descendants(db, query.category_id)
        where.append("p.category_id = ANY(CAST(:category_ids AS uuid[]))")
    if query.brand_id:
        params["brand_id"] = query.brand_id
        where.append("p.brand_id = CAST(:brand_id AS uuid)")
    if query.q:
        params["like"] = like_pattern(query.q)
        params["q"] = query.q
        params["fuzzy"] = FUZZY_THRESHOLD
        # ILIKE — aniq moslik. word_similarity — xatoli yozuv ("kronspan" → "Kronospan").
        # Postgres default chegarasi (0.6) bitta harf xatosini o'tkazmaydi; qisqa so'zda shovqin ko'p
        fuzzy = (
            """OR word_similarity(CAST(:q AS text), p.name_uz) >= :fuzzy
                       OR word_similarity(CAST(:q AS text), p.name_ru) >= :fuzzy"""
            if len(query.q) >= FUZZY_MIN_LENGTH
            else ""
        )
        where.append(f"""(
        p.name_uz ILIKE :like OR p.name_ru ILIKE :like {fuzzy}
        OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active AND v.sku ILIKE :like)
      )""")
    if query.in_stock:
        where.append("""EXISTS (
        SELECT 1 FROM product_variants v
        WHERE v.product_id = p.id AND v.is_active AND v.stock_qty - v.reserved_qty > 0
      )""")

    min_price = "(SELECT MIN(v.base_price) FROM product_variants v WHERE v.product_id = p.id AND v.is_active)"
    sold = """(
      SELECT COALESCE(COUNT(*), 0) FROM order_items oi
      JOIN product_variants v ON v.id = oi.variant_id
      WHERE v.product_id = p.id AND oi.created_at > now() - interval '90 days'
    )"""
    order_by = {
        "price_asc": f"{min_price} ASC, p.name_uz ASC",
        "price_desc": f"{min_price} DESC, p.name_uz ASC",
        "name": "p.name_uz ASC",
        "new": "p.created_at DESC",
        "popular": (
            "GREATEST(word_similarity(CAST(:q AS text), p.name_uz), word_similarity(CAST(:q AS text), p.name_ru)) DESC, "
            f"{sold} DESC"
            if query.q
            else f"{sold} DESC, p.name_uz ASC"
        ),
    }[query.sort]

    where_sql = " AND ".join(where)
    rows = (
        await db.execute(
            text(
                f"SELECT p.id, COUNT(*) OVER () AS total FROM products p WHERE {where_sql} "
                f"ORDER BY {order_by} LIMIT :limit OFFSET :offset"
            ),
            {**params, "limit": query.limit, "offset": (query.page - 1) * query.limit},
        )
    ).all()
    id_list = [str(r.id) for r in rows]
    if rows:
        total = rows[0].total
    else:
        # Oxirgi sahifadan keyin qator yo'q — jami sonini alohida so'raymiz
        total = (await db.execute(text(f"SELECT COUNT(*) FROM products p WHERE {where_sql}"), params)).scalar_one()

    items = await cards(db, id_list, user_id)
    return {"items": items, "total": int(total), "page": query.page, "limit": query.limit}


async def cards(db: AsyncSession, product_ids: list[str], user_id: str | None) -> list[dict[str, Any]]:
    """Mahsulot kartochkalari, berilgan tartibda"""
    if not product_ids:
        return []
    group_id = await price_group_of(db, user_id)
    products = (
        await db.scalars(
            select(Product)
            .where(Product.id.in_(product_ids))
            .options(
                joinedload(Product.brand),
                selectinload(Product.images),
                *variant_pricing_options(group_id, selectinload(Product.variants.and_(ProductVariant.is_active.is_(True)))),
            )
            .execution_options(populate_existing=True)
        )
    ).all()
    by_id = {p.id: p for p in products}

    out: list[dict[str, Any]] = []
    for id_ in product_ids:
        p = by_id.get(id_)
        if p is None or not p.variants:
            continue
        min_qty = decimal_str(p.min_qty)
        levels = [variant_stock_level(v) for v in p.variants]
        # "...dan" narxi sotuvda bor variantlardan; hammasi tugagan bo'lsa — barchasidan
        orderable = [v for v, lvl in zip(p.variants, levels, strict=True) if is_orderable(lvl)]
        priced = orderable or p.variants
        best = levels[0]
        for lvl in levels[1:]:
            if LEVEL_RANK[lvl] > LEVEL_RANK[best]:
                best = lvl
        out.append(
            {
                "id": p.id,
                "nameUz": p.name_uz,
                "nameRu": p.name_ru,
                "unit": p.unit,
                "kind": p.kind,
                "categoryId": p.category_id,
                "brand": p.brand and pick(p.brand, "id", "name"),
                "imageUrl": p.images[0].url if p.images else None,
                "priceFrom": min(price_of(v, min_qty).unit_price for v in priced),
                "basePriceFrom": min(v.base_price for v in priced),
                "stockLevel": best,
                "variantCount": len(p.variants),
                "variantId": p.variants[0].id if len(p.variants) == 1 else None,
                "minQty": min_qty,
                "qtyStep": decimal_str(p.qty_step),
            }
        )
    return out


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
