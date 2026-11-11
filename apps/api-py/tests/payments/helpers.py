import base64
import uuid
from types import SimpleNamespace
from typing import Any

import httpx

from app.models import CustomerProfile, Order
from tests.support import Ctx, UserCtx

Auth = dict[str, str]


PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")


def expect(res: httpx.Response, status: int) -> httpx.Response:
    assert res.status_code == status, res.text
    return res


class Env:
    def __init__(self, ctx: Ctx, c: SimpleNamespace, customer: UserCtx, manager: Auth, admin: Auth, warehouse_id: str):
        self.ctx = ctx
        self.c = c
        self.customer = customer
        self.manager = manager
        self.admin = admin
        self.warehouse_id = warehouse_id

    async def order(self, lines: list[tuple[str, int]], terms: dict[str, Any], who: UserCtx | None = None) -> str:
        who = who or self.customer
        for variant_id, qty in lines:
            expect(await self.ctx.http.put(f"/api/v1/cart/items/{variant_id}", headers=who.auth, json={"qty": qty}), 200)
        res = await self.ctx.http.post(
            "/api/v1/orders",
            headers={**who.auth, "Idempotency-Key": str(uuid.uuid4())},
            json={"deliveryType": "PICKUP", "warehouseId": self.warehouse_id},
        )
        order_id: str = expect(res, 201).json()["id"]
        if terms:
            # Shartlar saqlanadi, buyurtma NEW'da qoladi — to'lov qabul qilinadi, yig'ishga deliver() beradi
            expect(await self.set_terms(order_id, terms), 200)
        return order_id

    async def set_terms(self, order_id: str, terms: dict[str, Any]) -> httpx.Response:
        body = {"terms": {"allowedMethods": ["CASH", "CARD_TRANSFER"], **terms}}
        return await self.ctx.http.put(f"/api/v1/admin/orders/{order_id}/terms", headers=self.manager, json=body)

    async def go(self, order_id: str, body: dict[str, Any], auth: Auth | None = None) -> httpx.Response:
        return await self.ctx.http.post(f"/api/v1/admin/orders/{order_id}/transition", headers=auth or self.manager, json=body)

    async def deliver(self, order_id: str) -> httpx.Response:
        expect(await self.go(order_id, {"to": "PREPARING", "overrideCreditLimit": True, "comment": "test"}), 200)
        expect(await self.go(order_id, {"to": "READY"}), 200)
        return expect(await self.go(order_id, {"to": "DELIVERED", "receiverName": "Aziz"}), 200)

    async def upload(self, auth: Auth, content: bytes, filename: str, mime: str) -> httpx.Response:
        return await self.ctx.http.post("/api/v1/uploads/receipts", headers=auth, files={"file": (filename, content, mime)})

    async def receipt(self, auth: Auth | None = None) -> str:
        res = await self.upload(auth or self.customer.auth, PNG, "chek.png", "image/png")
        return expect(res, 201).json()["id"]

    async def report(self, order_id: str, amount: int, **extra: Any) -> httpx.Response:
        body = {"amount": amount, "method": "CARD_TRANSFER", "receiptUploadId": await self.receipt(), **extra}
        return await self.ctx.http.post(f"/api/v1/orders/{order_id}/payments", headers=self.customer.auth, json=body)

    async def confirm(self, payment_id: str, auth: Auth | None = None) -> httpx.Response:
        return await self.ctx.http.post(f"/api/v1/admin/payments/{payment_id}/confirm", headers=auth or self.manager)

    async def profile(self) -> CustomerProfile:
        return await self.ctx.get(CustomerProfile, self.customer.user.id)

    async def get_order(self, order_id: str) -> Order:
        return await self.ctx.get(Order, order_id)
