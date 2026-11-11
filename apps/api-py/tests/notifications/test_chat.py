from types import SimpleNamespace
from typing import Any

import httpx

from app.services import realtime as RT
from tests.notifications.helpers import PNG, drain, fields, next_event, notifications, place_order, token
from tests.support import assert_matches, user_with_token

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
