"""
Katalog yo'llari.
Login ixtiyoriy. Token bo'lsa mijozning guruh narxi qo'llanadi.
Admin yo'llari — admin_router.py (shu yerga ulanadi).
"""

from typing import Annotated

from fastapi import Depends

from app.auth.deps import AuthUser, OptionalUser, require_roles
from app.core.http import api_router
from app.db import Db
from app.modules.catalog import service
from app.modules.catalog.admin_router import router as admin_router
from app.modules.catalog.schemas import PricingQuoteInput, ProductListQuery, parse_uuid, query_model

router = api_router(tags=["catalog"])


def _uid(user: AuthUser | None) -> str | None:
    return user.id if user else None


@router.get("/categories")
async def categories(db: Db):
    return await service.categories(db)


@router.get("/brands")
async def brands(db: Db):
    return await service.brands(db)


@router.get("/products")
async def products(user: OptionalUser, query: Annotated[ProductListQuery, Depends(query_model(ProductListQuery))], db: Db):
    return await service.list_products(db, query, _uid(user))


@router.get("/products/{id}")
async def detail(user: OptionalUser, id: str, db: Db):
    return await service.detail(db, parse_uuid(id), _uid(user))


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
