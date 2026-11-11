"""
Socket.IO, namespace /rt. Ulanish: io(`${API}/rt`, { auth: { token: accessToken } }).
Token yo'q yoki yaroqsiz — ulanish rad etiladi. Bir nechta API nusxasi uchun — Redis orqali tarqatiladi.
"""

import re
from typing import Any

import socketio
from sqlalchemy import func, select

from app.auth.tokens import AccessPayload, decode_access
from app.config import get_settings
from app.db import standalone_session
from app.domain.state_machine import STAFF_ROLES
from app.models import Order

NS = "/rt"

# Hodisa nomlari — @mebel/shared RT bilan bir xil
ORDER_CREATED = "order.created"
ORDER_STATUS_CHANGED = "order.status_changed"
ORDER_TERMS_SET = "order.terms_set"
PAYMENT_CREATED = "payment.created"
PAYMENT_UPDATED = "payment.updated"
CHAT_MESSAGE = "chat.message"
CHAT_READ = "chat.read"
DELIVERY_ASSIGNED = "delivery.assigned"
NOTIFICATION = "notification"
ORDER_SUBSCRIBE = "order.subscribe"
ORDER_UNSUBSCRIBE = "order.unsubscribe"


def room_user(user_id: str) -> str:
    return f"user:{user_id}"


def room_order(order_id: str) -> str:
    return f"order:{order_id}"


ROOM_STAFF = "staff"

_sio: socketio.AsyncServer | None = None


def sio() -> socketio.AsyncServer:
    global _sio
    if _sio is None:
        env = get_settings()
        manager = socketio.AsyncRedisManager(env.REDIS_URL) if env.NODE_ENV != "test" else None
        _sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*", client_manager=manager)
        _register(_sio)
    return _sio


async def to_user(user_id: str, event: str, data: Any) -> None:
    await sio().emit(event, _json(data), room=room_user(user_id), namespace=NS)


async def to_staff(event: str, data: Any) -> None:
    await sio().emit(event, _json(data), room=ROOM_STAFF, namespace=NS)


async def to_order(order_id: str, event: str, data: Any) -> None:
    await sio().emit(event, _json(data), room=room_order(order_id), namespace=NS)


def _json(data: Any) -> Any:
    from app.core.serialize import dump

    return dump(data)


_UUID_RE = re.compile(r"^[0-9a-f-]{36}$", re.IGNORECASE)


async def _can_access(user: dict[str, str], order_id: str) -> bool:
    if not _UUID_RE.match(order_id):
        return False
    if user["role"] in ("MANAGER", "SUPER_ADMIN"):
        return True
    if user["role"] != "CUSTOMER":
        return False
    async with standalone_session() as db:
        n = await db.scalar(
            select(func.count()).select_from(Order).where(Order.id == order_id, Order.customer_id == user["userId"])
        )
    return bool(n)


def _register(server: socketio.AsyncServer) -> None:
    @server.on("connect", namespace=NS)
    async def connect(sid: str, _environ: dict[str, Any], auth: dict[str, Any] | None = None) -> None:
        token = (auth or {}).get("token")
        payload: AccessPayload | None = decode_access(token) if isinstance(token, str) else None
        if payload is None:
            raise socketio.exceptions.ConnectionRefusedError({"code": "UNAUTHORIZED"})
        await server.save_session(sid, {"userId": payload.sub, "role": payload.role}, namespace=NS)
        await server.enter_room(sid, room_user(payload.sub), namespace=NS)
        if payload.role in STAFF_ROLES:
            await server.enter_room(sid, ROOM_STAFF, namespace=NS)
        await server.emit("ready", {"userId": payload.sub, "role": payload.role}, to=sid, namespace=NS)

    # Buyurtma sahifasi ochilganda — shu buyurtmaning chat va status hodisalari
    @server.on(ORDER_SUBSCRIBE, namespace=NS)
    async def subscribe(sid: str, body: Any = None) -> dict[str, Any]:
        order_id = body.get("orderId") if isinstance(body, dict) else None
        user = await server.get_session(sid, namespace=NS)
        if not order_id or not await _can_access(user, order_id):
            return {"ok": False, "error": "NOT_FOUND"}
        await server.enter_room(sid, room_order(order_id), namespace=NS)
        return {"ok": True}

    @server.on(ORDER_UNSUBSCRIBE, namespace=NS)
    async def unsubscribe(sid: str, body: Any = None) -> dict[str, Any]:
        order_id = body.get("orderId") if isinstance(body, dict) else None
        if order_id:
            await server.leave_room(sid, room_order(order_id), namespace=NS)
        return {"ok": True}
