from types import SimpleNamespace

from sqlalchemy import select

from app.models import Notification
from app.modules.notifications import dispatcher
from tests.deliveries.helpers import DELIVERY_DATE, assign, driver_api, order, ready
from tests.support import assert_matches

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
