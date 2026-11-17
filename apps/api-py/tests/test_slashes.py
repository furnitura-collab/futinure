"""Oxirgi slesh: yo'naltirishsiz bir xil javob (brauzer keshlagan eski yo'naltirish bilan tsikl bo'lmasin)."""

import pytest

from tests.support import Ctx, user_with_token


@pytest.mark.parametrize("path", ["/api/v1/notifications?limit=1", "/api/v1/notifications/?limit=1", "/api/v1/me/"])
async def test_trailing_slash_no_redirect(ctx: Ctx, path: str) -> None:
    customer = await user_with_token(ctx, "CUSTOMER")
    res = await ctx.http.get(path, headers=customer.auth)
    assert res.status_code == 200


async def test_api_root_untouched(ctx: Ctx) -> None:
    # Faqat /api/v1/... ichidagi yo'llar; prefiksning o'zi o'zgarmaydi
    res = await ctx.http.get("/api/v1/")
    assert res.status_code == 404
