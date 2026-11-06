"""Admin katalogi"""

from decimal import Decimal
from typing import Any

from sqlalchemy import and_, delete, func, insert, or_, select, text, true, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import pick, row
from app.db import transaction
from app.models import (
    Brand,
    Category,
    CustomerProfile,
    OrderItem,
    PriceGroup,
    PriceHistory,
    Product,
    ProductImage,
    ProductVariant,
    StockMovement,
    VariantGroupPrice,
    VariantPriceTier,
    utcnow,
)
from app.modules.catalog.category_tree import category_with_descendants, would_create_cycle
from app.modules.catalog.pricing import sorted_tiers, variant_stock_level
from app.modules.catalog.schemas import (
    AdminProductListQuery,
    BrandInput,
    BrandUpdate,
    CategoryInput,
    CategoryUpdate,
    GroupPriceInput,
    ImageInput,
    PriceGroupInput,
    PriceGroupUpdate,
    PriceTierInput,
    ProductInput,
    ProductUpdate,
    VariantInput,
    VariantUpdate,
)
from app.modules.catalog.service import like_pattern
from app.services.audit import audit

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


# ───────────── Kategoriyalar ─────────────


async def categories(db: AsyncSession) -> list[dict[str, Any]]:
    products = select(func.count()).select_from(Product).where(Product.category_id == Category.id).scalar_subquery()
    child = Category.__table__.alias("child")
    children = select(func.count()).select_from(child).where(child.c.parent_id == Category.id).scalar_subquery()
    rows = (
        await db.execute(
            select(Category, products.label("products"), children.label("children"))
            .order_by(Category.sort_order, Category.name_uz)
            .execution_options(populate_existing=True)
        )
    ).all()
    return [row(c, _count={"products": p, "children": ch}) for c, p, ch in rows]


async def _ensure_category(db: AsyncSession, id_: str) -> Category:
    c = await db.get(Category, id_, populate_existing=True)
    if not c:
        raise AppError.not_found("Kategoriya")
    return c


async def create_category(db: AsyncSession, body: CategoryInput, actor: AuthUser) -> Category:
    data = body.data()
    if data["parent_id"]:
        await _ensure_category(db, data["parent_id"])
    async with transaction(db):
        category = Category(**data)
        db.add(category)
        await db.flush()
        await audit(db, actor_id=actor.id, entity="category", entity_id=category.id, action="create", after=category)
    return category


async def update_category(db: AsyncSession, id_: str, body: CategoryUpdate, actor: AuthUser) -> Category:
    data = body.data()
    c = await _ensure_category(db, id_)
    before = row(c)
    if "parent_id" in data and data["parent_id"] != c.parent_id:
        rows = (await db.execute(select(Category.id, Category.parent_id))).all()
        if data["parent_id"] == id_ or would_create_cycle([(r.id, r.parent_id) for r in rows], id_, data["parent_id"]):
            raise AppError("CATEGORY_CYCLE", "Kategoriya o'zining ichiga joylashtirilmaydi")
    async with transaction(db):
        for k, v in data.items():
            setattr(c, k, v)
        c.updated_at = utcnow()
        await db.flush()
        await audit(db, actor_id=actor.id, entity="category", entity_id=id_, action="update", before=before, after=c)
    return c


async def delete_category(db: AsyncSession, id_: str, actor: AuthUser) -> None:
    c = await _ensure_category(db, id_)
    before = row(c)
    products = await db.scalar(select(func.count()).select_from(Product).where(Product.category_id == id_)) or 0
    children = await db.scalar(select(func.count()).select_from(Category).where(Category.parent_id == id_)) or 0
    if products or children:
        raise AppError(
            "CATEGORY_NOT_EMPTY",
            "Kategoriyada mahsulot yoki ichki kategoriya bor. O'chirish o'rniga nofaol qiling",
            409,
            {"products": products, "children": children},
        )
    async with transaction(db):
        await db.execute(delete(Category).where(Category.id == id_))
        await audit(db, actor_id=actor.id, entity="category", entity_id=id_, action="delete", before=before)


# ───────────── Brendlar va narx guruhlari ─────────────


async def brands(db: AsyncSession) -> list[dict[str, Any]]:
    products = select(func.count()).select_from(Product).where(Product.brand_id == Brand.id).scalar_subquery()
    rows = (await db.execute(select(Brand, products.label("products")).order_by(Brand.name))).all()
    return [row(b, _count={"products": n}) for b, n in rows]


async def create_brand(db: AsyncSession, body: BrandInput) -> Brand:
    async with transaction(db):
        brand = Brand(**body.data())
        db.add(brand)
        await db.flush()
    return brand


async def update_brand(db: AsyncSession, id_: str, body: BrandUpdate) -> Brand:
    async with transaction(db):
        brand = await db.get(Brand, id_, populate_existing=True)
        if not brand:
            raise record_not_found()
        for k, v in body.data().items():
            setattr(brand, k, v)
        await db.flush()
    return brand


async def delete_brand(db: AsyncSession, id_: str) -> None:
    if await db.scalar(select(func.count()).select_from(Product).where(Product.brand_id == id_)):
        raise AppError("BRAND_IN_USE", "Brend mahsulotlarda ishlatilmoqda", 409)
    async with transaction(db):
        res = await db.execute(delete(Brand).where(Brand.id == id_))
        if not res.rowcount:
            raise record_not_found()


async def price_groups(db: AsyncSession) -> list[dict[str, Any]]:
    customers = (
        select(func.count()).select_from(CustomerProfile).where(CustomerProfile.price_group_id == PriceGroup.id).scalar_subquery()
    )
    prices = (
        select(func.count())
        .select_from(VariantGroupPrice)
        .where(VariantGroupPrice.price_group_id == PriceGroup.id)
        .scalar_subquery()
    )
    rows = (
        await db.execute(select(PriceGroup, customers.label("customers"), prices.label("prices")).order_by(PriceGroup.name))
    ).all()
    return [row(g, _count={"customers": c, "prices": p}) for g, c, p in rows]


async def create_price_group(db: AsyncSession, body: PriceGroupInput) -> PriceGroup:
    async with transaction(db):
        group = PriceGroup(**body.data())
        db.add(group)
        await db.flush()
    return group


async def update_price_group(db: AsyncSession, id_: str, body: PriceGroupUpdate) -> PriceGroup:
    async with transaction(db):
        group = await db.get(PriceGroup, id_, populate_existing=True)
        if not group:
            raise record_not_found()
        for k, v in body.data().items():
            setattr(group, k, v)
        await db.flush()
    return group


async def delete_price_group(db: AsyncSession, id_: str) -> None:
    if await db.scalar(select(func.count()).select_from(CustomerProfile).where(CustomerProfile.price_group_id == id_)):
        raise AppError("PRICE_GROUP_IN_USE", "Guruhda mijozlar bor", 409)
    async with transaction(db):
        res = await db.execute(delete(PriceGroup).where(PriceGroup.id == id_))
        if not res.rowcount:
            raise record_not_found()


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
