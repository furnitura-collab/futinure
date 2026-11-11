from sqlalchemy import select

from app.models import (
    StockMovement,
)
from tests.admin_orders.helpers import Env, expect, terms
from tests.support import Ctx, assert_matches

# ───────────────────────── Yetkazish oqimi (DELIVERY) ─────────────────────────


async def assign_driver(env: Env, order_id: str) -> None:
    res = await env.ctx.http.put(
        f"/api/v1/admin/orders/{order_id}/delivery", headers=env.manager, json={"driverId": env.driver_id}
    )
    expect(res, 200)


async def test_delivery_out_failed_returned_resent_delivered(env: Env):
    c = env.c
    o = await env.place_order([(c.white.id, 12)], delivery=True)
    expect(await env.go(o["id"], env.manager, {"to": "CONFIRMED", "terms": terms(deliveryFee=80_000)}), 200)
    await assign_driver(env, o["id"])
    expect(await env.go(o["id"], env.manager, {"to": "PREPARING"}), 200)
    expect(await env.go(o["id"], env.manager, {"to": "READY"}), 200)
    # Yetkazishda omborchi topshira olmaydi
    wrong = expect(await env.go(o["id"], env.warehouse, {"to": "DELIVERED", "receiverName": "Aziz"}), 409)
    assert wrong.json()["error"]["code"] == "TRANSITION_WRONG_DELIVERY_TYPE"

    expect(await env.go(o["id"], env.driver, {"to": "OUT_FOR_DELIVERY"}), 200)
    assert [await env.stock(c.white.id), await env.reserved(c.white.id)] == ["108", "0"]

    expect(await env.go(o["id"], env.driver, {"to": "READY"}), 409)  # sabab kerak
    expect(await env.go(o["id"], env.driver, {"to": "READY", "comment": "Mijoz telefonni olmadi"}), 200)
    assert [await env.stock(c.white.id), await env.reserved(c.white.id)] == ["120", "12"]

    expect(await env.go(o["id"], env.driver, {"to": "OUT_FOR_DELIVERY"}), 200)
    res = expect(await env.go(o["id"], env.driver, {"to": "DELIVERED"}), 200)
    assert_matches(res.json(), {"status": "DELIVERED", "grandTotal": 4_700_000})
    assert [await env.stock(c.white.id), await env.reserved(c.white.id)] == ["108", "0"]


async def test_on_order_item_not_shipped_until_received(ctx: Ctx, env: Env):
    c = env.c
    o = await env.place_order([(c.slide_v.id, 2)], delivery=True)
    expect(await env.go(o["id"], env.manager, {"to": "CONFIRMED", "terms": terms()}), 200)
    await assign_driver(env, o["id"])
    expect(await env.go(o["id"], env.manager, {"to": "PREPARING"}), 200)
    expect(await env.go(o["id"], env.manager, {"to": "READY"}), 200)
    res = expect(await env.go(o["id"], env.driver, {"to": "OUT_FOR_DELIVERY"}), 409)
    assert_matches(
        res.json()["error"],
        {"code": "STOCK_NOT_RECEIVED", "details": {"shortages": [{"sku": "GTV-SL-500", "available": "0"}]}},
    )

    movement = {"type": "IN", "variantId": c.slide_v.id, "qty": 5}
    expect(await ctx.http.post("/api/v1/admin/stock/movements", headers=env.warehouse, json=movement), 201)
    expect(await env.go(o["id"], env.driver, {"to": "OUT_FOR_DELIVERY"}), 200)
    assert await env.stock(c.slide_v.id) == "3"


# ───────────────────────── Bekor qilish ─────────────────────────


async def test_cancel_confirmed_releases_reserve(ctx: Ctx, env: Env):
    c = env.c
    o = await env.place_order([(c.white.id, 12)])
    expect(await env.go(o["id"], env.manager, {"to": "CONFIRMED", "terms": terms()}), 200)
    expect(await env.go(o["id"], env.manager, {"to": "CANCELLED"}), 409)  # sabab kerak
    expect(await env.go(o["id"], env.manager, {"to": "CANCELLED", "comment": "Mijoz rad etdi"}), 200)
    assert await env.reserved(c.white.id) == "0"
    moves = await ctx.all(select(StockMovement).where(StockMovement.order_id == o["id"]).order_by(StockMovement.created_at))
    assert [m.type for m in moves] == ["RESERVE", "RELEASE"]


async def test_only_super_admin_cancels_ready(env: Env):
    c = env.c
    o = await env.place_order([(c.white.id, 12)])
    expect(await env.go(o["id"], env.manager, {"to": "CONFIRMED", "terms": terms()}), 200)
    expect(await env.go(o["id"], env.manager, {"to": "PREPARING"}), 200)
    expect(await env.go(o["id"], env.manager, {"to": "READY"}), 200)
    expect(await env.go(o["id"], env.manager, {"to": "CANCELLED", "comment": "x x x"}), 403)
    expect(await env.go(o["id"], env.admin, {"to": "CANCELLED", "comment": "Mijoz voz kechdi"}), 200)
    assert await env.reserved(c.white.id) == "0"


async def test_customer_cancels_new_order_no_reserve_no_error(ctx: Ctx, env: Env):
    o = await env.place_order([(env.c.white.id, 1)])
    res = await ctx.http.post(f"/api/v1/orders/{o['id']}/cancel", headers=env.customer.auth, json={"reason": "Kerak emas"})
    expect(res, 200)
    assert await ctx.count(StockMovement, StockMovement.order_id == o["id"]) == 0
