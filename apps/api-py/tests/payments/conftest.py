import pytest

from app.models import Setting
from tests.payments.helpers import Env
from tests.support import Ctx, seed_catalog, seed_warehouse, user_with_token


@pytest.fixture
async def env(ctx: Ctx) -> Env:
    c = await seed_catalog(ctx)
    customer = await user_with_token(ctx, "CUSTOMER")
    manager = (await user_with_token(ctx, "MANAGER")).auth
    admin = (await user_with_token(ctx, "SUPER_ADMIN")).auth
    warehouse_id = (await seed_warehouse(ctx)).id
    await ctx.add(Setting(key="payment.card", value={"number": "8600 1234", "holder": "MEBEL"}))
    return Env(ctx, c, customer, manager, admin, warehouse_id)
