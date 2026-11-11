import uuid
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import httpx

from app.models import (
    ProductVariant,
)
from tests.support import Ctx, UserCtx, seed_address

Auth = dict[str, str]


def expect(res: httpx.Response, status: int) -> httpx.Response:
    assert res.status_code == status, res.text
    return res


def dec(v: Decimal) -> str:
    """Prisma Decimal.toString(): ortiqcha nollarsiz"""
    return format(Decimal(v).normalize(), "f")


class Env:
    def __init__(self, ctx: Ctx, c: SimpleNamespace, customer: UserCtx, **staff: Any) -> None:
        self.ctx = ctx
        self.c = c
        self.customer = customer
        self.manager: Auth = staff["manager"]
        self.admin: Auth = staff["admin"]
        self.warehouse: Auth = staff["warehouse"]
        self.driver: Auth = staff["driver"]
        self.driver_id: str = staff["driver_id"]
        self.warehouse_id: str = staff["warehouse_id"]

    async def place_order(
        self, lines: list[tuple[str, int]], *, delivery: bool = False, who: UserCtx | None = None
    ) -> dict[str, Any]:
        who = who or self.customer
        for variant_id, qty in lines:
            expect(await self.ctx.http.put(f"/api/v1/cart/items/{variant_id}", headers=who.auth, json={"qty": qty}), 200)
        body = (
            {"deliveryType": "DELIVERY", "addressId": (await seed_address(self.ctx, who.user.id)).id}
            if delivery
            else {"deliveryType": "PICKUP", "warehouseId": self.warehouse_id}
        )
        res = await self.ctx.http.post("/api/v1/orders", headers={**who.auth, "Idempotency-Key": str(uuid.uuid4())}, json=body)
        return expect(res, 201).json()

    async def go(self, order_id: str, auth: Auth, body: dict[str, Any]) -> httpx.Response:
        return await self.ctx.http.post(f"/api/v1/admin/orders/{order_id}/transition", headers=auth, json=body)

    async def quote(self, order_id: str, body: dict[str, Any]) -> httpx.Response:
        return await self.ctx.http.post(f"/api/v1/admin/orders/{order_id}/quotes", headers=self.manager, json={**terms(), **body})

    async def reserved(self, variant_id: str) -> str:
        return dec((await self.ctx.get(ProductVariant, variant_id)).reserved_qty)

    async def stock(self, variant_id: str) -> str:
        return dec((await self.ctx.get(ProductVariant, variant_id)).stock_qty)


def terms(**over: Any) -> dict[str, Any]:
    return {"paymentTerms": "ON_DELIVERY", "allowedMethods": ["CASH"], **over}


async def accept(e: Env, order_id: str, quote_id: str, auth: Auth | None = None) -> httpx.Response:
    return await e.ctx.http.post(f"/api/v1/orders/{order_id}/quotes/{quote_id}/accept", headers=auth or e.customer.auth)
