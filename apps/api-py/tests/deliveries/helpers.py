import base64
import uuid
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import httpx

from app.models import ProductVariant
from tests.support import UserCtx

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")


DUE = 2 * 395_000 + 50_000


# ───── yordamchilar ─────

# Buyurtma sanasi bugundan 60 kungacha bo'lishi kerak — qat'iy sana vaqt o'tib eskiradi
DELIVERY_DATE = date.today() + timedelta(days=1)


async def go(s: SimpleNamespace, id: str, body: dict[str, Any], auth: dict[str, str] | None = None) -> httpx.Response:
    return await s.ctx.http.post(f"/api/v1/admin/orders/{id}/transition", headers=auth or s.manager, json=body)


async def order(s: SimpleNamespace, terms: dict[str, Any] | None = None, delivery_type: str = "DELIVERY") -> str:
    """2 ta oq LDSP (2 × 395 000), yetkazish, menejer tasdiqlagan"""
    terms = terms or {"paymentTerms": "ON_DELIVERY"}
    ctx = s.ctx
    res = await ctx.http.put(f"/api/v1/cart/items/{s.c.white.id}", headers=s.customer.auth, json={"qty": 2})
    assert res.status_code == 200, res.text
    body = (
        {"deliveryType": delivery_type, "addressId": s.address_id, "deliveryDate": DELIVERY_DATE.isoformat()}
        if delivery_type == "DELIVERY"
        else {"deliveryType": delivery_type, "warehouseId": s.warehouse_id}
    )
    res = await ctx.http.post("/api/v1/orders", headers={**s.customer.auth, "Idempotency-Key": str(uuid.uuid4())}, json=body)
    assert res.status_code == 201, res.text
    id = res.json()["id"]
    res = await go(s, id, {"to": "CONFIRMED", "terms": {"allowedMethods": ["CASH"], "deliveryFee": 50_000, **terms}})
    assert res.status_code == 200, res.text
    return id


async def assign(s: SimpleNamespace, id: str, body: dict[str, Any]) -> httpx.Response:
    return await s.ctx.http.put(f"/api/v1/admin/orders/{id}/delivery", headers=s.manager, json=body)


async def ready(s: SimpleNamespace, id: str) -> None:
    assert (await go(s, id, {"to": "PREPARING"})).status_code == 200
    assert (await go(s, id, {"to": "READY"})).status_code == 200


async def driver_api(s: SimpleNamespace, path: str, body: dict[str, Any], who: UserCtx | None = None) -> httpx.Response:
    who = who or s.driver
    return await s.ctx.http.post(f"/api/v1/driver/deliveries/{path}", headers=who.auth, json=body)


async def proof(s: SimpleNamespace, who: UserCtx | None = None) -> str:
    who = who or s.driver
    res = await s.ctx.http.post("/api/v1/driver/uploads/proof", headers=who.auth, files={"file": ("foto.png", PNG, "image/png")})
    assert res.status_code == 201, res.text
    return res.json()["id"]


async def stock(s: SimpleNamespace) -> Decimal:
    return (await s.ctx.get(ProductVariant, s.c.white.id)).stock_qty
