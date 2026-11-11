from types import SimpleNamespace

import pytest

from tests.support import Ctx, seed_address, seed_catalog, seed_warehouse, user_with_token


@pytest.fixture
async def s(ctx: Ctx) -> SimpleNamespace:
    """beforeEach: katalog, mijoz, ikki haydovchi, menejer, manzil, ombor"""
    c = await seed_catalog(ctx)
    customer = await user_with_token(ctx, "CUSTOMER")
    driver = await user_with_token(ctx, "DRIVER")
    other_driver = await user_with_token(ctx, "DRIVER")
    manager = (await user_with_token(ctx, "MANAGER")).auth
    address_id = (await seed_address(ctx, customer.user.id)).id
    warehouse_id = (await seed_warehouse(ctx)).id
    return SimpleNamespace(
        ctx=ctx, c=c, customer=customer, driver=driver, other_driver=other_driver, manager=manager,
        address_id=address_id, warehouse_id=warehouse_id,
    )  # fmt: skip
