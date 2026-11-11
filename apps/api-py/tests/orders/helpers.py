import uuid
from types import SimpleNamespace
from typing import Any

from tests.support import Ctx

TOTAL = 12 * 380_000 + 4 * 14_000


async def put_cart(ctx: Ctx, auth: dict[str, str], variant_id: str, qty: int) -> None:
    res = await ctx.http.put(f"/api/v1/cart/items/{variant_id}", headers=auth, json={"qty": qty})
    assert res.status_code == 200, res.text


async def fill_cart(ctx: Ctx, c: SimpleNamespace, auth: dict[str, str]) -> None:
    await put_cart(ctx, auth, c.white.id, 12)
    await put_cart(ctx, auth, c.hinge_v.id, 4)


async def create(ctx: Ctx, auth: dict[str, str], body: dict[str, Any], key: str | None = None):
    headers = {**auth, "Idempotency-Key": key or str(uuid.uuid4())}
    return await ctx.http.post("/api/v1/orders", headers=headers, json=body)


async def create_ok(ctx: Ctx, auth: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
    res = await create(ctx, auth, body)
    assert res.status_code == 201, res.text
    return res.json()


async def cancel(ctx: Ctx, auth: dict[str, str], order_id: str, reason: str):
    return await ctx.http.post(f"/api/v1/orders/{order_id}/cancel", headers=auth, json={"reason": reason})


async def get_ok(ctx: Ctx, auth: dict[str, str] | None, url: str) -> Any:
    res = await ctx.http.get(url, headers=auth)
    assert res.status_code == 200, res.text
    return res.json()
