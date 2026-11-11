"""
Test yordamchilari: kontekst, fake yuboruvchilar, fixture ma'lumotlar (foydalanuvchi, katalog, ombor, manzil).

    async def test_x(ctx: Ctx):
        c = await seed_catalog(ctx)
        customer = await user_with_token(ctx, "CUSTOMER")
        res = await ctx.http.post("/api/v1/cart/items", headers=customer.auth, json={...})
        assert res.status_code == 201
        assert_matches(res.json(), {"count": 1})
"""

from tests.support_ctx import Ctx, FakePush, FakeSms, FakeTelegram, assert_matches
from tests.support_seed import UserCtx, login, seed_address, seed_catalog, seed_warehouse, user_with_token

__all__ = [
    "Ctx",
    "FakePush",
    "FakeSms",
    "FakeTelegram",
    "assert_matches",
    "UserCtx",
    "login",
    "seed_address",
    "seed_catalog",
    "seed_warehouse",
    "user_with_token",
]
