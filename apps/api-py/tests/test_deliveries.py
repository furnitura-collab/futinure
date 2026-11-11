import base64
import uuid
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from sqlalchemy import select, update

from app.models import CustomerProfile, Delivery, LedgerEntry, Notification, Order, OrderStatusHistory, Payment, ProductVariant
from app.modules.notifications import dispatcher
from tests.support import Ctx, UserCtx, assert_matches, seed_address, seed_catalog, seed_warehouse, user_with_token

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
DUE = 2 * 395_000 + 50_000


@pytest.fixture
async def s(ctx: Ctx) -> SimpleNamespace:
    """beforeEach: katalog, mijoz, ikki haydovchi, menejer, manzil, ombor"""
    c = await seed_catalog(ctx)
    customer = await user_with_token(ctx, "CUSTOMER")
    driver = await user_with_token(ctx, "DRIVER")
    other_driver = await user_with_token(ctx, "DRIVER")
    manager = (await user_with_token(ctx, "MANAGER")).auth
    address_id = (await seed_address(ctx, customer.user.id)).id
    warehouse_id = (await seed_warehouse(ctx)).id
    return SimpleNamespace(
        ctx=ctx, c=c, customer=customer, driver=driver, other_driver=other_driver, manager=manager,
        address_id=address_id, warehouse_id=warehouse_id,
    )  # fmt: skip


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


# ───── haydovchi biriktirish ─────


async def test_manager_assigns_date_from_order_visible_in_detail(s: SimpleNamespace):
    id = await order(s)
    res = await assign(s, id, {"driverId": s.driver.user.id})
    assert res.status_code == 200
    assert_matches(
        res.json()["delivery"],
        {
            "driverId": s.driver.user.id,
            "status": "ASSIGNED",
            "scheduledDate": f"{DELIVERY_DATE.isoformat()}T00:00:00.000Z",
            "driver": {"id": s.driver.user.id},
        },
    )

    drivers = await s.ctx.http.get("/api/v1/admin/drivers", headers=s.manager)
    assert drivers.status_code == 200
    assert next(d for d in drivers.json() if d["id"] == s.driver.user.id)["_count"]["deliveries"] == 1


async def test_pickup_non_driver_and_customer_rejected(s: SimpleNamespace):
    pickup = await order(s, {"paymentTerms": "ON_DELIVERY"}, "PICKUP")
    res = await assign(s, pickup, {"driverId": s.driver.user.id})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "NOT_A_DELIVERY"

    id = await order(s)
    res = await assign(s, id, {"driverId": s.customer.user.id})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "NOT_A_DRIVER"
    res = await s.ctx.http.put(f"/api/v1/admin/orders/{id}/delivery", headers=s.driver.auth, json={"driverId": s.driver.user.id})
    assert res.status_code == 403


async def test_cannot_reassign_after_departure(s: SimpleNamespace):
    id = await order(s)
    assert (await assign(s, id, {"driverId": s.driver.user.id})).status_code == 200
    await ready(s, id)
    assert (await driver_api(s, f"{id}/start", {})).status_code == 200
    res = await assign(s, id, {"driverId": s.other_driver.user.id})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "DELIVERY_LOCKED"


async def test_driver_notified_old_driver_loses_delivery(s: SimpleNamespace):
    ctx = s.ctx
    id = await order(s)
    assert (await assign(s, id, {"driverId": s.driver.user.id})).status_code == 200
    assert (await assign(s, id, {"driverId": s.other_driver.user.id})).status_code == 200
    await dispatcher.drain()

    notes = await ctx.all(select(Notification).where(Notification.type == "delivery.assigned").order_by(Notification.created_at))
    assert [n.user_id for n in notes] == [s.driver.user.id, s.other_driver.user.id]
    assert "Chilonzor" in notes[0].body

    mine = await ctx.http.get("/api/v1/driver/deliveries", headers=s.driver.auth)
    assert mine.status_code == 200
    assert len(mine.json()["active"]) == 0
    theirs = await ctx.http.get("/api/v1/driver/deliveries", headers=s.other_driver.auth)
    assert theirs.status_code == 200
    assert len(theirs.json()["active"]) == 1


# ───── haydovchi ilovasi ─────


async def test_driver_sees_and_changes_only_own_deliveries(s: SimpleNamespace):
    ctx = s.ctx
    id = await order(s)
    assert (await assign(s, id, {"driverId": s.driver.user.id})).status_code == 200
    await ready(s, id)

    res = await ctx.http.get("/api/v1/driver/deliveries", headers=s.driver.auth)
    assert res.status_code == 200
    active = res.json()["active"]
    assert len(active) == 1
    assert_matches(
        active[0]["order"],
        {
            "status": "READY",
            "itemsCount": 1,
            "toCollect": DUE,
            "addressSnapshot": {"addressText": "Toshkent, Chilonzor 5-kvartal"},
        },
    )
    # Narxlar haydovchiga ko'rinmaydi
    assert "grandTotal" not in active[0]["order"]

    assert (await ctx.http.get(f"/api/v1/driver/deliveries/{id}", headers=s.other_driver.auth)).status_code == 404
    assert (await driver_api(s, f"{id}/start", {}, s.other_driver)).status_code == 404
    # Umumiy transition endpointi ham boshqa haydovchiga yopiq
    assert (await go(s, id, {"to": "OUT_FOR_DELIVERY"}, s.other_driver.auth)).status_code == 404
    assert (await ctx.http.get("/api/v1/driver/deliveries", headers=s.customer.auth)).status_code == 403


async def test_cannot_start_when_order_not_ready(s: SimpleNamespace):
    id = await order(s)
    assert (await assign(s, id, {"driverId": s.driver.user.id})).status_code == 200
    res = await driver_api(s, f"{id}/start", {})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "TRANSITION_NO_SUCH_TRANSITION"


async def test_full_flow_start_deliver_with_photo_and_cash_confirm_completes(s: SimpleNamespace):
    ctx = s.ctx
    id = await order(s)
    assert (await assign(s, id, {"driverId": s.driver.user.id})).status_code == 200
    await ready(s, id)

    started = await driver_api(s, f"{id}/start", {})
    assert started.status_code == 200
    assert_matches(started.json(), {"status": "IN_TRANSIT", "order": {"status": "OUT_FOR_DELIVERY"}})
    assert await stock(s) == Decimal(118)

    photo = await proof(s)
    done = await driver_api(s, f"{id}/deliver", {"receiverName": "Aziz aka", "proofUploadId": photo, "cashCollected": DUE})
    assert done.status_code == 200
    assert_matches(
        done.json(),
        {
            "status": "DELIVERED",
            "receiverName": "Aziz aka",
            "cashCollected": DUE,
            "proofUploadId": photo,
            "order": {"status": "DELIVERED", "toCollect": 0},
        },
    )

    # Naqd pul haydovchida — kassaga topshirilguncha PENDING
    payment = await ctx.first(select(Payment).where(Payment.order_id == id))
    assert payment is not None
    assert (payment.method, payment.status, payment.amount, payment.created_by) == (
        "CASH",
        "PENDING",
        DUE,
        s.driver.user.id,
    )
    history = await ctx.first(
        select(OrderStatusHistory).where(OrderStatusHistory.order_id == id, OrderStatusHistory.to_status == "DELIVERED")
    )
    assert history is not None
    assert history.comment == "Qabul qildi: Aziz aka"

    # Surat: menejer ko'radi, boshqa haydovchi — yo'q
    file = await ctx.http.get(f"/api/v1/admin/orders/{id}/delivery/proof", headers=s.manager)
    assert file.status_code == 200
    assert file.headers["content-type"] == "image/png"
    res = await ctx.http.get(f"/api/v1/admin/orders/{id}/delivery/proof", headers=s.other_driver.auth)
    assert res.status_code == 404

    # Bugun topshirilganlar ro'yxatida
    res = await ctx.http.get("/api/v1/driver/deliveries", headers=s.driver.auth)
    assert res.status_code == 200
    assert len(res.json()["active"]) == 0
    assert len(res.json()["done"]) == 1

    assert (await ctx.http.post(f"/api/v1/admin/payments/{payment.id}/confirm", headers=s.manager)).status_code == 200
    assert (await ctx.get(Order, id)).status == "COMPLETED"


async def test_excess_cash_rejected_nothing_changes(s: SimpleNamespace):
    ctx = s.ctx
    id = await order(s)
    assert (await assign(s, id, {"driverId": s.driver.user.id})).status_code == 200
    await ready(s, id)
    assert (await driver_api(s, f"{id}/start", {})).status_code == 200

    res = await driver_api(s, f"{id}/deliver", {"receiverName": "Aziz", "cashCollected": 10_000_000})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "AMOUNT_EXCEEDS_DUE"
    assert (await ctx.get(Order, id)).status == "OUT_FOR_DELIVERY"
    delivery = await ctx.first(select(Delivery).where(Delivery.order_id == id))
    assert delivery.status == "IN_TRANSIT"
    assert await ctx.count(LedgerEntry) == 0


async def test_proof_only_own_and_once(s: SimpleNamespace):
    a = await order(s)
    b = await order(s)
    for id in (a, b):
        assert (await assign(s, id, {"driverId": s.driver.user.id})).status_code == 200
        await ready(s, id)
        assert (await driver_api(s, f"{id}/start", {})).status_code == 200
    foreign = await proof(s, s.other_driver)
    assert (await driver_api(s, f"{a}/deliver", {"receiverName": "Aziz", "proofUploadId": foreign})).status_code == 404

    photo = await proof(s)
    assert (await driver_api(s, f"{a}/deliver", {"receiverName": "Aziz", "proofUploadId": photo})).status_code == 200
    res = await driver_api(s, f"{b}/deliver", {"receiverName": "Aziz", "proofUploadId": photo})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "PROOF_ALREADY_USED"


async def test_delivery_failed_returns_to_warehouse_notifies_and_reassignable(s: SimpleNamespace):
    ctx = s.ctx
    id = await order(s)
    assert (await assign(s, id, {"driverId": s.driver.user.id})).status_code == 200
    await ready(s, id)
    assert (await driver_api(s, f"{id}/start", {})).status_code == 200
    assert (await driver_api(s, f"{id}/fail", {"reason": "x"})).status_code == 422

    res = await driver_api(s, f"{id}/fail", {"reason": "Telefonni ko'tarmadi"})
    assert res.status_code == 200
    assert_matches(res.json(), {"status": "FAILED", "failReason": "Telefonni ko'tarmadi", "order": {"status": "READY"}})
    assert await stock(s) == Decimal(120)

    await dispatcher.drain()
    note = await ctx.first(
        select(Notification).where(Notification.user_id == s.customer.user.id, Notification.type == "order.delivery_failed")
    )
    assert note is not None
    assert note.title == "Yetkazib bo'lmadi"
    assert "Telefonni ko'tarmadi" in note.body
    assert any("Yetkazilmadi" in m for m in ctx.telegram.messages)

    # Faol ro'yxatda qoladi; qayta biriktirilsa yangi urinish
    res = await ctx.http.get("/api/v1/driver/deliveries", headers=s.driver.auth)
    assert res.status_code == 200
    assert res.json()["active"][0]["status"] == "FAILED"
    again = await assign(s, id, {"driverId": s.driver.user.id, "scheduledDate": "2026-11-11"})
    assert again.status_code == 200
    assert_matches(again.json()["delivery"], {"status": "ASSIGNED", "scheduledDate": "2026-11-11T00:00:00.000Z"})


async def test_credit_collects_nothing(s: SimpleNamespace):
    ctx = s.ctx
    await ctx.db.execute(
        update(CustomerProfile).where(CustomerProfile.user_id == s.customer.user.id).values(credit_limit=5_000_000)
    )
    await ctx.db.commit()
    id = await order(s, {"paymentTerms": "CREDIT"})
    assert (await assign(s, id, {"driverId": s.driver.user.id})).status_code == 200
    res = await ctx.http.get(f"/api/v1/driver/deliveries/{id}", headers=s.driver.auth)
    assert res.status_code == 200
    assert res.json()["order"]["toCollect"] == 0
    assert len(res.json()["order"]["items"]) == 1
