from types import SimpleNamespace

import pytest

from tests.support import Ctx, seed_catalog, user_with_token


@pytest.fixture
async def c(ctx: Ctx) -> SimpleNamespace:
    return await seed_catalog(ctx)


@pytest.fixture
async def auth(ctx: Ctx, c: SimpleNamespace) -> dict[str, str]:
    return (await user_with_token(ctx, "MANAGER")).auth
