"""Mijoz katalogi: mahsulotlar ro'yxati (qidiruv, saralash) va kartalar."""

from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.serialize import decimal_str, pick
from app.domain.availability import StockLevel, is_orderable
from app.models import Product, ProductVariant
from app.modules.catalog.category_tree import category_with_descendants
from app.modules.catalog.pricing import price_group_of, price_of, variant_pricing_options, variant_stock_level
from app.modules.catalog.schemas import ProductListQuery

LEVEL_RANK: dict[StockLevel, int] = {"IN_STOCK": 3, "LOW": 2, "ON_ORDER": 1, "OUT_OF_STOCK": 0}
FUZZY_THRESHOLD = 0.45
FUZZY_MIN_LENGTH = 4


def like_pattern(q: str) -> str:
    """LIKE uchun maxsus belgilarni ekranlash"""
    return "%" + "".join(f"\\{c}" if c in "\\%_" else c for c in q) + "%"


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
