from types import SimpleNamespace
from typing import Any

import pytest
from sqlalchemy import text

from tests.support import Ctx, UserCtx, seed_catalog, seed_warehouse, user_with_token


@pytest.fixture
async def c(ctx: Ctx) -> SimpleNamespace:
    # Ketma-ketlikni ham qayta boshlaymiz — raqam formatini tekshirish uchun
    await ctx.db.execute(text("ALTER SEQUENCE order_number_seq RESTART WITH 1"))
    await ctx.db.commit()
    return await seed_catalog(ctx)


@pytest.fixture
async def customer(ctx: Ctx, c: SimpleNamespace) -> UserCtx:
    return await user_with_token(ctx, "CUSTOMER", price_group_id=c.usta.id)


@pytest.fixture
async def auth(customer: UserCtx) -> dict[str, str]:
    return customer.auth


@pytest.fixture
async def warehouse_id(ctx: Ctx, customer: UserCtx) -> str:
    return (await seed_warehouse(ctx)).id


@pytest.fixture
def pickup(warehouse_id: str) -> dict[str, Any]:
    return {"deliveryType": "PICKUP", "warehouseId": warehouse_id}
