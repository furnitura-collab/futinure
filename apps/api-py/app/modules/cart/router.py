"""Savat va sevimlilar"""

from typing import Annotated

from fastapi import Depends
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert

from app.auth.deps import AuthUser, require_roles
from app.core.errors import AppError
from app.core.http import api_router
from app.db import Db, transaction
from app.models import Favorite, Product
from app.modules.cart import service
from app.modules.cart.schemas import CartBulkAddInput, CartItemInput
from app.modules.catalog.schemas import parse_uuid
from app.modules.catalog.service import cards

router = api_router(tags=["cart"])

Customer = Annotated[AuthUser, Depends(require_roles("CUSTOMER"))]


# ───── Savat ─────
@router.get("/cart")
async def view(u: Customer, db: Db):
    return (await service.view(db, u.id)).as_dict()


@router.put("/cart/items/{variant_id}")
async def set_item(u: Customer, variant_id: str, body: CartItemInput, db: Db):
    return (await service.set_item(db, u.id, parse_uuid(variant_id), body.qty)).as_dict()


@router.delete("/cart/items/{variant_id}")
async def remove_item(u: Customer, variant_id: str, db: Db):
    return (await service.remove_item(db, u.id, parse_uuid(variant_id))).as_dict()


@router.delete("/cart", status_code=204)
async def clear(u: Customer, db: Db):
    await service.clear(db, u.id)


@router.post("/cart/items/bulk")
async def bulk(u: Customer, body: CartBulkAddInput, db: Db):
    return await service.bulk_add(db, u.id, body)


@router.post("/cart/reorder/{order_id}")
async def reorder(u: Customer, order_id: str, db: Db):
    return await service.reorder(db, u.id, parse_uuid(order_id))


# ───── Sevimlilar ─────
@router.get("/favorites")
async def favorites(u: Customer, db: Db):
    ids = (
        await db.scalars(select(Favorite.product_id).where(Favorite.user_id == u.id).order_by(Favorite.created_at.desc()))
    ).all()
    # Nofaol bo'lib qolgan mahsulotlar kartochkaga tushmaydi
    return await cards(db, list(ids), u.id)


@router.put("/favorites/{product_id}", status_code=204)
async def add_favorite(u: Customer, product_id: str, db: Db):
    product_id = parse_uuid(product_id)
    if not await db.scalar(
        select(func.count()).select_from(Product).where(Product.id == product_id, Product.is_active.is_(True))
    ):
        raise AppError.not_found("Mahsulot")
    async with transaction(db):
        await db.execute(insert(Favorite).values(user_id=u.id, product_id=product_id).on_conflict_do_nothing())


@router.delete("/favorites/{product_id}", status_code=204)
async def remove_favorite(u: Customer, product_id: str, db: Db):
    async with transaction(db):
        await db.execute(delete(Favorite).where(Favorite.user_id == u.id, Favorite.product_id == parse_uuid(product_id)))
