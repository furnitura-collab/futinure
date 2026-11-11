from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import select, update

from app.models import CustomerProfile, Delivery, LedgerEntry, Notification, Order, OrderStatusHistory, Payment
from app.modules.notifications import dispatcher
from tests.deliveries.helpers import DUE, assign, driver_api, go, order, proof, ready, stock
from tests.support import assert_matches

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
