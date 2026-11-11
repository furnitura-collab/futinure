import pytest

from tests.admin_orders.helpers import Env
from tests.support import Ctx, seed_catalog, seed_warehouse, user_with_token


@pytest.fixture
async def env(ctx: Ctx) -> Env:
    c = await seed_catalog(ctx)
    customer = await user_with_token(ctx, "CUSTOMER")
    manager = (await user_with_token(ctx, "MANAGER")).auth
    admin = (await user_with_token(ctx, "SUPER_ADMIN")).auth
    warehouse = (await user_with_token(ctx, "WAREHOUSE")).auth
    d = await user_with_token(ctx, "DRIVER")
    warehouse_id = (await seed_warehouse(ctx)).id
    return Env(
        ctx, c, customer,
        manager=manager, admin=admin, warehouse=warehouse, driver=d.auth, driver_id=d.user.id, warehouse_id=warehouse_id,
    )  # fmt: skip
