"""
Katalog yo'llari.
Login ixtiyoriy. Token bo'lsa mijozning guruh narxi qo'llanadi.
Admin yo'llari — admin_router.py (shu yerga ulanadi).
"""

from typing import Annotated

from fastapi import Depends

from app.auth.deps import AuthUser, OptionalUser, require_roles
from app.core.cache import catalog_cached
from app.core.http import api_router
from app.db import Db
from app.modules.catalog import service
from app.modules.catalog.admin_router import router as admin_router
from app.modules.catalog.schemas import PricingQuoteInput, ProductListQuery, parse_uuid, query_model

router = api_router(tags=["catalog"])

# Daraxt va brendlar kam o'zgaradi; ro'yxat va kartochkada qoldiq bor — qisqaroq
TREE_TTL = 300
PRODUCTS_TTL = 60


def _uid(user: AuthUser | None) -> str | None:
    return user.id if user else None


def _viewer(user: AuthUser | None) -> str:
    """Narx mijozning guruhiga bog'liq — kesh kaliti foydalanuvchi bo'yicha, mehmonlar umumiy"""
    return user.id if user else "guest"


@router.get("/categories")
async def categories(db: Db):
    return await catalog_cached("categories", TREE_TTL, lambda: service.categories(db))


@router.get("/brands")
async def brands(db: Db):
    return await catalog_cached("brands", TREE_TTL, lambda: service.brands(db))


@router.get("/products")
async def products(user: OptionalUser, query: Annotated[ProductListQuery, Depends(query_model(ProductListQuery))], db: Db):
    return await catalog_cached(
        "products", PRODUCTS_TTL, lambda: service.list_products(db, query, _uid(user)), _viewer(user), query.model_dump_json()
    )


@router.get("/products/{id}")
async def detail(user: OptionalUser, id: str, db: Db):
    product_id = parse_uuid(id)
    return await catalog_cached(
        "product", PRODUCTS_TTL, lambda: service.detail(db, product_id, _uid(user)), _viewer(user), product_id
    )


@router.get("/variants/by-sku/{sku}")
async def by_sku(user: OptionalUser, sku: str, db: Db):
    return await service.by_sku(db, sku, _uid(user))


@router.post("/pricing/quote")
async def quote(user: OptionalUser, body: PricingQuoteInput, db: Db):
    return await service.quote(db, body, _uid(user))


# Bosh sahifadagi "Yana buyurtma qilish" — oldin olingan tovarlar, oxirgi miqdori bilan
@router.get("/me/buy-again")
async def buy_again(user: Annotated[AuthUser, Depends(require_roles("CUSTOMER"))], db: Db):
    return await service.buy_again(db, user.id)


router.include_router(admin_router)
