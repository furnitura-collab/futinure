from types import SimpleNamespace

from sqlalchemy import update

from app.models import DeviceToken, User
from tests.notifications.helpers import PNG, TERMS, drain, fields, go, notifications, place_order
from tests.support import assert_matches

# ───── mijozga bildirishnoma ─────


async def test_manager_accepts_order_notification_and_push(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    assert (await go(s, o["id"], {"to": "PREPARING", "terms": TERMS})).status_code == 200
    await drain()
    [n] = await notifications(s)
    assert_matches(fields(n), {"type": "order.preparing", "title": "Buyurtma qabul qilindi", "payload": {"orderId": o["id"]}})
    assert n.body == f"{o['number']} qabul qilindi va yig'ilmoqda. Jami: 4 620 000 so'm"
    assert (ctx.push.sent[0].to, ctx.push.sent[0].title) == ("ExponentPushToken[mijoz]", "Buyurtma qabul qilindi")


async def test_russian_customer_gets_russian(s: SimpleNamespace):
    ctx = s.ctx
    await ctx.db.execute(update(User).where(User.id == s.customer.user.id).values(locale="ru"))
    await ctx.db.commit()
    o = await place_order(s)
    assert (await go(s, o["id"], {"to": "PREPARING", "terms": TERMS})).status_code == 200
    await drain()
    assert_matches(
        fields((await notifications(s))[0]),
        {"title": "Заказ принят", "body": f"{o['number']} принят и собирается. Итого: 4 620 000 сум"},
    )


async def test_customer_cancel_goes_to_telegram_not_customer(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    await drain()
    ctx.telegram.messages.clear()
    res = await ctx.http.post(f"/api/v1/orders/{o['id']}/cancel", headers=s.customer.auth, json={"reason": "Kerak emas"})
    assert res.status_code == 200
    await drain()
    assert await notifications(s) == []
    assert "Mijoz buyurtmani bekor qildi" in ctx.telegram.messages[0]
    assert "Kerak emas" in ctx.telegram.messages[0]


async def test_ready_for_pickup_special_text(s: SimpleNamespace):
    o = await place_order(s)
    assert (await go(s, o["id"], {"to": "PREPARING", "terms": TERMS})).status_code == 200
    assert (await go(s, o["id"], {"to": "READY"})).status_code == 200
    await drain()
    assert [n.title for n in await notifications(s)] == ["Buyurtma qabul qilindi", "Olib ketishga tayyor"]


async def test_payment_receipt_to_telegram_confirmation_to_customer(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    assert (await go(s, o["id"], {"to": "PREPARING", "terms": TERMS})).status_code == 200
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
    assert (await go(s, o["id"], {"to": "PREPARING", "terms": TERMS})).status_code == 200
    await drain()
    assert await ctx.count(DeviceToken) == 0


async def test_api_list_unread_count_mark_read(s: SimpleNamespace):
    ctx = s.ctx
    auth = s.customer.auth
    o = await place_order(s)
    assert (await go(s, o["id"], {"to": "PREPARING", "terms": TERMS})).status_code == 200
    assert (await go(s, o["id"], {"to": "READY"})).status_code == 200
    await drain()
    res = await ctx.http.get("/api/v1/notifications", headers=auth)
    assert res.status_code == 200
    assert_matches(res.json(), {"total": 2, "unread": 2})
    assert "eventId" not in res.json()["items"][0]
    assert (await ctx.http.post("/api/v1/notifications/read", headers=auth, json={})).status_code == 422
    assert (await ctx.http.post("/api/v1/notifications/read", headers=auth, json={"all": True})).status_code == 200
    assert (await ctx.http.get("/api/v1/notifications", headers=auth)).json()["unread"] == 0
