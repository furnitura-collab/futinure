"""Admin katalogi: kategoriyalar, brendlar va narx guruhlari."""

from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import row
from app.db import transaction
from app.models import Brand, Category, CustomerProfile, PriceGroup, Product, VariantGroupPrice, utcnow
from app.modules.catalog.admin_common import record_not_found
from app.modules.catalog.category_tree import would_create_cycle
from app.modules.catalog.schemas import BrandInput, BrandUpdate, CategoryInput, CategoryUpdate, PriceGroupInput, PriceGroupUpdate
from app.services.audit import audit

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
