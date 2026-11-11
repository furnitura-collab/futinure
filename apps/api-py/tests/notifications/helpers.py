import asyncio
import base64
import uuid
from collections.abc import Awaitable
from types import SimpleNamespace
from typing import Any

import httpx
import socketio
from sqlalchemy import select

from app.models import Notification
from app.modules.notifications import dispatcher

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")


NS = "/rt"


TERMS = {"paymentTerms": "ON_DELIVERY", "allowedMethods": ["CASH", "CARD_TRANSFER"]}


drain = dispatcher.drain


def next_event(client: socketio.AsyncClient, event: str, ms: int = 3000) -> Awaitable[Any]:
    """Keyingi hodisani kutadi (oldindan obuna bo'lib)"""
    fut: asyncio.Future[Any] = asyncio.get_running_loop().create_future()

    def handler(data: Any) -> None:
        if not fut.done():
            fut.set_result(data)

    client.on(event, handler, namespace=NS)
    return asyncio.wait_for(fut, ms / 1000)


def token(auth: dict[str, str]) -> str:
    return auth["Authorization"][7:]


# ───── yordamchilar ─────


async def place_order(s: SimpleNamespace, qty: int = 12) -> dict[str, Any]:
    ctx = s.ctx
    res = await ctx.http.put(f"/api/v1/cart/items/{s.c.white.id}", headers=s.customer.auth, json={"qty": qty})
    assert res.status_code == 200, res.text
    res = await ctx.http.post(
        "/api/v1/orders",
        headers={**s.customer.auth, "Idempotency-Key": str(uuid.uuid4())},
        json={"deliveryType": "PICKUP", "warehouseId": s.warehouse_id},
    )
    assert res.status_code == 201, res.text
    return res.json()


async def go(s: SimpleNamespace, id: str, body: dict[str, Any]) -> httpx.Response:
    return await s.ctx.http.post(f"/api/v1/admin/orders/{id}/transition", headers=s.manager, json=body)


async def notifications(s: SimpleNamespace, user_id: str | None = None) -> list[Notification]:
    uid = user_id or s.customer.user.id
    return await s.ctx.all(select(Notification).where(Notification.user_id == uid).order_by(Notification.created_at))


def fields(n: Notification) -> dict[str, Any]:
    return {"type": n.type, "title": n.title, "body": n.body, "payload": n.payload}
