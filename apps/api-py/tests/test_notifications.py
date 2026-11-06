import asyncio
import base64
import socket
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import date
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
import socketio
import uvicorn
from sqlalchemy import select, text, update

from app.models import DeviceToken, Notification, Order, OutboxEvent, User, utcnow
from app.modules.notifications import debt_reminders, dispatcher
from app.services import realtime as RT
from tests.support import Ctx, assert_matches, seed_catalog, seed_warehouse, user_with_token

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
NS = "/rt"
TERMS = {"paymentTerms": "ON_DELIVERY", "allowedMethods": ["CASH", "CARD_TRANSFER"]}

drain = dispatcher.drain


@pytest.fixture
async def s(ctx: Ctx) -> SimpleNamespace:
    """beforeEach: katalog, mijoz (push tokeni bilan), menejer, ombor"""
    c = await seed_catalog(ctx)
    customer = await user_with_token(ctx, "CUSTOMER")
    manager_user = await user_with_token(ctx, "MANAGER")
    warehouse_id = (await seed_warehouse(ctx)).id
    await ctx.add(DeviceToken(user_id=customer.user.id, token="ExponentPushToken[mijoz]", platform="ios"))
    return SimpleNamespace(
        ctx=ctx, c=c, customer=customer, manager_user=manager_user, manager=manager_user.auth, warehouse_id=warehouse_id
    )


# ───── haqiqiy HTTP server (Socket.IO uchun) ─────


@pytest.fixture(scope="module")
async def server_url() -> AsyncIterator[str]:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    # lifespan="off": to'xtatilganda umumiy DB/Redis ulanishlari yopilmasin
    server = uvicorn.Server(uvicorn.Config("app.main:app", host="127.0.0.1", port=port, log_level="warning", lifespan="off"))
    task = asyncio.create_task(server.serve())
    for _ in range(200):
        if server.started:
            break
        await asyncio.sleep(0.02)
    assert server.started, "uvicorn ishga tushmadi"
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    await task


@pytest.fixture
async def connect(server_url: str) -> AsyncIterator[Callable[..., Awaitable[socketio.AsyncClient]]]:
    clients: list[socketio.AsyncClient] = []

    async def _connect(token: str | None = None) -> socketio.AsyncClient:
        client = socketio.AsyncClient(reconnection=False)
        clients.append(client)
        ready: asyncio.Future[Any] = asyncio.get_running_loop().create_future()

        def on_ready(data: Any) -> None:
            if not ready.done():
                ready.set_result(data)

        client.on("ready", on_ready, namespace=NS)
        await client.connect(
            server_url, namespaces=[NS], auth={"token": token} if token else {}, transports=["websocket"], wait_timeout=3
        )
        await asyncio.wait_for(ready, 3)
        return client

    yield _connect
    for client in clients:
        if client.connected:
            await client.disconnect()


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


# ───── outbox ─────


async def test_new_order_event_written_and_sent_to_telegram(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    events = await ctx.all(select(OutboxEvent))
    assert [e.type for e in events] == ["order.created"]
    assert await drain() == 1
    assert len(ctx.telegram.messages) == 1
    assert o["number"] in ctx.telegram.messages[0]
    assert "4 620 000 so'm" in ctx.telegram.messages[0]
    assert (await ctx.first(select(OutboxEvent))).processed_at is not None


async def test_rolled_back_transaction_leaves_no_event(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s, 130)  # omborda 120
    await drain()
    assert (await go(s, o["id"], {"to": "CONFIRMED", "terms": TERMS})).status_code == 409
    assert await ctx.count(OutboxEvent, OutboxEvent.processed_at.is_(None)) == 0


async def test_handler_error_retried_later(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    # Hodisa qayta ishlanguncha buyurtma yo'qolsa — handler yiqiladi
    await ctx.db.execute(update(Order).where(Order.id == o["id"]).values(number=o["number"]))
    await ctx.db.execute(text("""UPDATE outbox_events SET payload = '{"orderId":"01900000-0000-7000-8000-000000000000"}'"""))
    await ctx.db.commit()
    await drain()
    e = await ctx.first(select(OutboxEvent))
    assert (e.attempts, e.processed_at) == (1, None)
    assert e.last_error
    assert e.next_attempt_at > utcnow()


async def test_reprocessing_gives_no_duplicate_notification_or_push(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    assert (await go(s, o["id"], {"to": "CONFIRMED", "terms": TERMS})).status_code == 200
    await drain()
    assert len(await notifications(s)) == 1
    assert len(ctx.push.sent) == 1

    await ctx.db.execute(update(OutboxEvent).values(processed_at=None))
    await ctx.db.commit()
    await drain()
    assert len(await notifications(s)) == 1
    assert len(ctx.push.sent) == 1


# ───── mijozga bildirishnoma ─────


async def test_manager_confirmed_notification_and_push(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    assert (await go(s, o["id"], {"to": "CONFIRMED", "terms": TERMS})).status_code == 200
    await drain()
    [n] = await notifications(s)
    assert_matches(fields(n), {"type": "order.confirmed", "title": "Buyurtma tasdiqlandi", "payload": {"orderId": o["id"]}})
    assert n.body == f"{o['number']} tasdiqlandi. Jami: 4 620 000 so'm"
    assert (ctx.push.sent[0].to, ctx.push.sent[0].title) == ("ExponentPushToken[mijoz]", "Buyurtma tasdiqlandi")


async def test_russian_customer_gets_russian(s: SimpleNamespace):
    ctx = s.ctx
    await ctx.db.execute(update(User).where(User.id == s.customer.user.id).values(locale="ru"))
    await ctx.db.commit()
    o = await place_order(s)
    assert (await go(s, o["id"], {"to": "CONFIRMED", "terms": TERMS})).status_code == 200
    await drain()
    assert_matches(
        fields((await notifications(s))[0]),
        {"title": "Заказ подтверждён", "body": f"{o['number']} подтверждён. Итого: 4 620 000 сум"},
    )


async def test_quote_single_new_quote_message(s: SimpleNamespace):
    """QUOTED statusi alohida xabar bermaydi"""
    ctx = s.ctx
    o = await place_order(s)
    res = await ctx.http.post(f"/api/v1/admin/orders/{o['id']}/quotes", headers=s.manager, json={**TERMS, "deliveryFee": 80_000})
    assert res.status_code == 201
    await drain()
    items = await notifications(s)
    assert [n.type for n in items] == ["order.quote"]
    assert "4 700 000" in items[0].body


async def test_customer_accepts_quote_goes_to_telegram_not_customer(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    q = await ctx.http.post(f"/api/v1/admin/orders/{o['id']}/quotes", headers=s.manager, json=TERMS)
    assert q.status_code == 201
    await drain()
    ctx.telegram.messages.clear()
    res = await ctx.http.post(f"/api/v1/orders/{o['id']}/quotes/{q.json()['quote']['id']}/accept", headers=s.customer.auth)
    assert res.status_code == 200
    await drain()
    assert [n.type for n in await notifications(s)] == ["order.quote"]
    assert "Mijoz taklifni qabul qildi" in ctx.telegram.messages[0]


async def test_ready_for_pickup_special_text(s: SimpleNamespace):
    o = await place_order(s)
    assert (await go(s, o["id"], {"to": "CONFIRMED", "terms": TERMS})).status_code == 200
    assert (await go(s, o["id"], {"to": "PREPARING"})).status_code == 200
    assert (await go(s, o["id"], {"to": "READY"})).status_code == 200
    await drain()
    assert [n.title for n in await notifications(s)] == [
        "Buyurtma tasdiqlandi",
        "Buyurtma tayyorlanmoqda",
        "Olib ketishga tayyor",
    ]


async def test_payment_receipt_to_telegram_confirmation_to_customer(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    assert (await go(s, o["id"], {"to": "CONFIRMED", "terms": TERMS})).status_code == 200
    up = await ctx.http.post("/api/v1/uploads/receipts", headers=s.customer.auth, files={"file": ("c.png", PNG, "image/png")})
    assert up.status_code == 201
    p = await ctx.http.post(
        f"/api/v1/orders/{o['id']}/payments",
        headers=s.customer.auth,
        json={"amount": 1_000_000, "method": "CARD_TRANSFER", "receiptUploadId": up.json()["id"]},
    )
    assert p.status_code == 201
    await drain()
    assert "Yangi chek: 1 000 000 so'm" in ctx.telegram.messages[-1]

    assert (await ctx.http.post(f"/api/v1/admin/payments/{p.json()['id']}/confirm", headers=s.manager)).status_code == 200
    await drain()
    assert_matches(
        fields((await notifications(s))[-1]),
        {"type": "payment.confirmed", "body": f"1 000 000 so'm qabul qilindi ({o['number']})"},
    )


async def test_invalid_push_token_removed(s: SimpleNamespace):
    ctx = s.ctx
    ctx.push.invalid.add("ExponentPushToken[mijoz]")
    o = await place_order(s)
    assert (await go(s, o["id"], {"to": "CONFIRMED", "terms": TERMS})).status_code == 200
    await drain()
    assert await ctx.count(DeviceToken) == 0


async def test_api_list_unread_count_mark_read(s: SimpleNamespace):
    ctx = s.ctx
    auth = s.customer.auth
    o = await place_order(s)
    assert (await go(s, o["id"], {"to": "CONFIRMED", "terms": TERMS})).status_code == 200
    assert (await go(s, o["id"], {"to": "PREPARING"})).status_code == 200
    await drain()
    res = await ctx.http.get("/api/v1/notifications", headers=auth)
    assert res.status_code == 200
    assert_matches(res.json(), {"total": 2, "unread": 2})
    assert "eventId" not in res.json()["items"][0]
    assert (await ctx.http.post("/api/v1/notifications/read", headers=auth, json={})).status_code == 422
    assert (await ctx.http.post("/api/v1/notifications/read", headers=auth, json={"all": True})).status_code == 200
    assert (await ctx.http.get("/api/v1/notifications", headers=auth)).json()["unread"] == 0


# ───── nasiya eslatmalari ─────


async def test_debt_reminders_2_days_before_on_day_every_3_days_after_once_per_day(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    await ctx.db.execute(
        update(Order)
        .where(Order.id == o["id"])
        .values(
            status="COMPLETED", payment_terms="CREDIT", grand_total=4_620_000, paid_total=620_000, due_date=date(2026, 11, 10)
        )
    )
    await ctx.db.commit()

    assert await debt_reminders.run("2026-11-07") == 0
    assert await debt_reminders.run("2026-11-08") == 1
    assert await debt_reminders.run("2026-11-08") == 0
    assert await debt_reminders.run("2026-11-10") == 1
    assert await debt_reminders.run("2026-11-12") == 0
    assert await debt_reminders.run("2026-11-13") == 1

    items = await notifications(s)
    assert [n.type for n in items] == ["debt.soon", "debt.soon", "debt.overdue"]
    assert items[2].body == f"{o['number']}: 4 000 000 so'm qarz, muddat 2026-11-10 edi"


# ───── socket ─────


async def test_socket_without_token_rejected(s: SimpleNamespace, connect):
    with pytest.raises(socketio.exceptions.ConnectionError):
        await connect()
    with pytest.raises(socketio.exceptions.ConnectionError):
        await connect("buzilgan.token.x")


async def test_staff_get_new_order_realtime(s: SimpleNamespace, connect):
    staff = await connect(token(s.manager))
    got = next_event(staff, RT.ORDER_CREATED)
    o = await place_order(s)
    await drain()
    assert_matches(await got, {"id": o["id"], "number": o["number"], "grandTotal": 4_620_000})


async def test_order_room_only_own_order_status_changes_arrive(s: SimpleNamespace, connect):
    ctx = s.ctx
    o = await place_order(s)
    mine = await connect(token(s.customer.auth))
    stranger = await connect(token((await user_with_token(ctx, "CUSTOMER")).auth))

    assert await mine.call(RT.ORDER_SUBSCRIBE, {"orderId": o["id"]}, namespace=NS) == {"ok": True}
    assert await stranger.call(RT.ORDER_SUBSCRIBE, {"orderId": o["id"]}, namespace=NS) == {"ok": False, "error": "NOT_FOUND"}

    status = next_event(mine, RT.ORDER_STATUS_CHANGED)
    notif = next_event(mine, RT.NOTIFICATION)
    assert (await go(s, o["id"], {"to": "CONFIRMED", "terms": TERMS})).status_code == 200
    await drain()
    assert_matches(await status, {"orderId": o["id"], "from": "NEW", "to": "CONFIRMED"})
    assert_matches(await notif, {"type": "order.confirmed"})


# ───── chat ─────


async def msgs(s: SimpleNamespace, id: str, auth: dict[str, str]) -> httpx.Response:
    return await s.ctx.http.get(f"/api/v1/orders/{id}/messages", headers=auth)


async def send(s: SimpleNamespace, id: str, auth: dict[str, str], body: dict[str, Any]) -> httpx.Response:
    return await s.ctx.http.post(f"/api/v1/orders/{id}/messages", headers=auth, json=body)


async def test_chat_customer_writes_manager_realtime_manager_replies_customer_push(s: SimpleNamespace, connect):
    ctx = s.ctx
    o = await place_order(s)
    staff = await connect(token(s.manager))
    incoming = next_event(staff, RT.CHAT_MESSAGE)

    m1 = await send(s, o["id"], s.customer.auth, {"text": "Kromka ham kerak, 25 metr"})
    assert m1.status_code == 201
    assert_matches(m1.json(), {"text": "Kromka ham kerak, 25 metr", "sender": {"role": "CUSTOMER"}})
    await drain()
    assert_matches(await incoming, {"id": m1.json()["id"], "orderNumber": o["number"]})
    assert await notifications(s, s.manager_user.user.id) == []

    assert (await send(s, o["id"], s.manager, {"text": "Qo'shib taklif yuboraman"})).status_code == 201
    await drain()
    [n] = await notifications(s)
    assert_matches(fields(n), {"type": "chat.message", "body": f"{o['number']}: Qo'shib taklif yuboraman"})
    assert ctx.push.sent[-1].title == "Menejerdan xabar"

    res = await msgs(s, o["id"], s.customer.auth)
    assert res.status_code == 200
    assert [m["text"] for m in res.json()["items"]] == ["Kromka ham kerak, 25 metr", "Qo'shib taklif yuboraman"]


async def test_chat_unread_count_and_mark_read(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    assert (await send(s, o["id"], s.customer.auth, {"text": "Salom"})).status_code == 201
    assert (await send(s, o["id"], s.customer.auth, {"text": "Qachon tayyor?"})).status_code == 201
    assert (await send(s, o["id"], s.manager, {"text": "Ertaga"})).status_code == 201

    admin = await ctx.http.get("/api/v1/admin/orders", headers=s.manager)
    assert admin.status_code == 200
    assert admin.json()["items"][0]["unreadMessages"] == 2
    mine = await ctx.http.get("/api/v1/orders", headers=s.customer.auth)
    assert mine.status_code == 200
    assert mine.json()["items"][0]["unreadMessages"] == 1

    res = await ctx.http.post(f"/api/v1/orders/{o['id']}/messages/read", headers=s.manager)
    assert res.status_code == 200
    assert res.json()["updated"] == 2
    assert (await ctx.http.get("/api/v1/admin/orders", headers=s.manager)).json()["items"][0]["unreadMessages"] == 0
    assert (await ctx.http.get("/api/v1/orders", headers=s.customer.auth)).json()["items"][0]["unreadMessages"] == 1


async def test_chat_pagination_load_older(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    for i in range(1, 6):
        assert (await send(s, o["id"], s.customer.auth, {"text": f"x{i}"})).status_code == 201
    last = await ctx.http.get(f"/api/v1/orders/{o['id']}/messages?limit=2", headers=s.customer.auth)
    assert last.status_code == 200
    assert_matches(last.json(), {"hasMore": True})
    assert [m["text"] for m in last.json()["items"]] == ["x4", "x5"]
    older = await ctx.http.get(
        f"/api/v1/orders/{o['id']}/messages?limit=10&before={last.json()['items'][0]['id']}", headers=s.customer.auth
    )
    assert older.status_code == 200
    assert [m["text"] for m in older.json()["items"]] == ["x1", "x2", "x3"]
    assert older.json()["hasMore"] is False


async def test_chat_attachment_upload_send_only_participants_see(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    up = await ctx.http.post("/api/v1/uploads/chat", headers=s.customer.auth, files={"file": ("chizma.png", PNG, "image/png")})
    assert up.status_code == 201
    m = await send(s, o["id"], s.customer.auth, {"attachmentUploadId": up.json()["id"]})
    assert m.status_code == 201
    assert_matches(m.json()["attachment"], {"mimeType": "image/png"})

    url = f"/api/v1/chat/messages/{m.json()['id']}/attachment"
    res = await ctx.http.get(url, headers=s.manager)
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert (await ctx.http.get(url, headers=(await user_with_token(ctx, "CUSTOMER")).auth)).status_code == 404
    # Boshqa xabarga qayta biriktirib bo'lmaydi
    assert (await send(s, o["id"], s.customer.auth, {"attachmentUploadId": up.json()["id"]})).status_code == 409


async def test_chat_empty_422_foreign_order_404_warehouse_403(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    assert (await send(s, o["id"], s.customer.auth, {})).status_code == 422
    assert (await send(s, o["id"], (await user_with_token(ctx, "CUSTOMER")).auth, {"text": "x"})).status_code == 404
    assert (await send(s, o["id"], (await user_with_token(ctx, "WAREHOUSE")).auth, {"text": "x"})).status_code == 403
