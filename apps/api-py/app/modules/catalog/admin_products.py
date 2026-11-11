"""Admin katalogi: mahsulotlar va rasmlar."""

from typing import Any

from sqlalchemy import and_, delete, func, or_, select, text, true, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import pick, row
from app.db import transaction
from app.models import OrderItem, Product, ProductImage, ProductVariant, StockMovement, utcnow
from app.modules.catalog.admin_categories import _ensure_category
from app.modules.catalog.admin_common import _variants_by_product, present_variant, to_db
from app.modules.catalog.category_tree import category_with_descendants
from app.modules.catalog.schemas import AdminProductListQuery, ImageInput, ProductInput, ProductUpdate
from app.modules.catalog.service import like_pattern
from app.services.audit import audit

# ───────────── Mahsulotlar ─────────────


async def products(db: AsyncSession, query: AdminProductListQuery) -> dict[str, Any]:
    conds: list[Any] = []
    if query.category_id:
        conds.append(Product.category_id.in_(await category_with_descendants(db, query.category_id)))
    if query.brand_id:
        conds.append(Product.brand_id == query.brand_id)
    if query.is_active is not None:
        conds.append(Product.is_active.is_(query.is_active))
    if query.q:
        like = like_pattern(query.q)
        conds.append(
            or_(
                Product.name_uz.ilike(like),
                Product.name_ru.ilike(like),
                Product.code.ilike(like),
                select(ProductVariant.id).where(ProductVariant.product_id == Product.id, ProductVariant.sku.ilike(like)).exists(),
            )
        )
    if query.low_stock:
        conds.append(Product.id.in_(await _low_stock_product_ids(db)))
    where = and_(*conds) if conds else true()

    rows = (
        await db.scalars(
            select(Product)
            .where(where)
            .order_by(Product.updated_at.desc())
            .offset((query.page - 1) * query.limit)
            .limit(query.limit)
            .options(selectinload(Product.category), selectinload(Product.brand), selectinload(Product.images))
            .execution_options(populate_existing=True)
        )
    ).all()
    total = await db.scalar(select(func.count()).select_from(Product).where(where)) or 0
    variants = await _variants_by_product(db, [p.id for p in rows])
    items = [
        row(
            p,
            category=pick(p.category, "id", "name_uz"),
            brand=p.brand and pick(p.brand, "id", "name"),
            images=[{"url": i.url} for i in p.images[:1]],
            variants=[present_variant(v) for v in variants[p.id]],
        )
        for p in rows
    ]
    return {"items": items, "total": total, "page": query.page, "limit": query.limit}


async def _low_stock_product_ids(db: AsyncSession) -> list[str]:
    rows = await db.execute(
        text("""
      SELECT DISTINCT product_id FROM product_variants
      WHERE is_active AND stock_qty - reserved_qty <= low_stock_threshold""")
    )
    return [str(r.product_id) for r in rows]


async def product(db: AsyncSession, id_: str) -> dict[str, Any]:
    p = await db.scalar(
        select(Product)
        .where(Product.id == id_)
        .options(selectinload(Product.category), selectinload(Product.brand), selectinload(Product.images))
        .execution_options(populate_existing=True)
    )
    if not p:
        raise AppError.not_found("Mahsulot")
    variants = await _variants_by_product(db, [p.id])
    return row(
        p,
        category=pick(p.category, "id", "name_uz", "name_ru"),
        brand=p.brand and pick(p.brand, "id", "name"),
        images=[row(i) for i in p.images],
        variants=[present_variant(v) for v in variants[p.id]],
    )


async def create_product(db: AsyncSession, body: ProductInput, actor: AuthUser) -> dict[str, Any]:
    await _ensure_category(db, body.category_id)
    async with transaction(db):
        p = Product(**to_db(body.data()))
        db.add(p)
        await db.flush()
        await audit(db, actor_id=actor.id, entity="product", entity_id=p.id, action="create", after=p)
    return await product(db, p.id)


async def update_product(db: AsyncSession, id_: str, body: ProductUpdate, actor: AuthUser) -> dict[str, Any]:
    data = body.data()
    p = await db.get(Product, id_, populate_existing=True)
    if not p:
        raise AppError.not_found("Mahsulot")
    before = row(p)
    if data.get("category_id"):
        await _ensure_category(db, data["category_id"])

    kind = data.get("kind") or p.kind
    length = data["board_length_mm"] if "board_length_mm" in data else p.board_length_mm
    width = data["board_width_mm"] if "board_width_mm" in data else p.board_width_mm
    if kind == "BOARD" and (length is None or width is None):
        raise AppError("BOARD_DIMENSIONS_REQUIRED", "Plita uchun o'lchamlar majburiy", 422)

    async with transaction(db):
        for k, v in to_db(data).items():
            setattr(p, k, v)
        p.updated_at = utcnow()
        await db.flush()
        await audit(db, actor_id=actor.id, entity="product", entity_id=id_, action="update", before=before, after=p)
    return await product(db, id_)


async def delete_product(db: AsyncSession, id_: str, actor: AuthUser) -> None:
    """Buyurtmalarda ishlatilgan mahsulot o'chirilmaydi — faqat nofaol qilinadi"""
    p = await db.get(Product, id_, populate_existing=True)
    if not p:
        raise AppError.not_found("Mahsulot")
    before = row(p)
    used = await db.scalar(
        select(func.count())
        .select_from(OrderItem)
        .join(ProductVariant, ProductVariant.id == OrderItem.variant_id)
        .where(ProductVariant.product_id == id_)
    )
    if used:
        raise AppError("PRODUCT_IN_USE", "Mahsulot buyurtmalarda bor. O'chirish o'rniga nofaol qiling", 409)
    async with transaction(db):
        variant_ids = select(ProductVariant.id).where(ProductVariant.product_id == id_)
        await db.execute(delete(StockMovement).where(StockMovement.variant_id.in_(variant_ids)))
        await db.execute(delete(Product).where(Product.id == id_))
        await audit(db, actor_id=actor.id, entity="product", entity_id=id_, action="delete", before=before)
    db.expunge(p)


# ───────────── Rasmlar ─────────────


async def add_image(db: AsyncSession, product_id: str, body: ImageInput) -> ProductImage:
    if not await db.scalar(select(func.count()).select_from(Product).where(Product.id == product_id)):
        raise AppError.not_found("Mahsulot")
    async with transaction(db):
        image = ProductImage(product_id=product_id, url=body.url, sort_order=body.sort_order)
        db.add(image)
        await db.flush()
    return image


async def reorder_images(db: AsyncSession, product_id: str, image_ids: list[str]) -> None:
    async with transaction(db):
        for i, id_ in enumerate(image_ids):
            await db.execute(
                update(ProductImage).where(ProductImage.id == id_, ProductImage.product_id == product_id).values(sort_order=i)
            )


async def delete_image(db: AsyncSession, product_id: str, image_id: str) -> None:
    async with transaction(db):
        res = await db.execute(delete(ProductImage).where(ProductImage.id == image_id, ProductImage.product_id == product_id))
    if not res.rowcount:
        raise AppError.not_found("Rasm")
