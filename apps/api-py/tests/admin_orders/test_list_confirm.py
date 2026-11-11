import asyncio

from app.models import (
    Order,
    StockMovement,
)
from tests.admin_orders.helpers import Env, expect, terms
from tests.support import Ctx, assert_matches, user_with_token

# ───────────────────────── Ro'yxat va kanban ─────────────────────────


async def test_new_order_in_new_column_search_by_number_and_phone(ctx: Ctx, env: Env):
    c = env.c
    o = await env.place_order([(c.white.id, 12)])
    kanban = expect(await ctx.http.get("/api/v1/admin/orders/kanban", headers=env.manager), 200)
    col = next(k for k in kanban.json() if k["status"] == "NEW")
    assert col["total"] == 1
    assert_matches(col["items"][0], {"number": o["number"], "itemsCount": 1, "grandTotal": 4_620_000, "balanceDue": 4_620_000})

    by_number = expect(await ctx.http.get(f"/api/v1/admin/orders?q={o['number'][-6:]}", headers=env.manager), 200)
    assert by_number.json()["total"] == 1
    by_phone = expect(await ctx.http.get(f"/api/v1/admin/orders?q={env.customer.user.phone[-7:]}", headers=env.manager), 200)
    assert by_phone.json()["total"] == 1
    unassigned = expect(await ctx.http.get("/api/v1/admin/orders?managerId=none", headers=env.manager), 200)
    assert unassigned.json()["total"] == 1


async def test_customer_and_warehouse_cannot_see_admin_list(ctx: Ctx, env: Env):
    expect(await ctx.http.get("/api/v1/admin/orders", headers=env.customer.auth), 403)
    expect(await ctx.http.get("/api/v1/admin/orders", headers=env.warehouse), 403)


async def test_detail_stock_shortage_and_available_transitions(ctx: Ctx, env: Env):
    c = env.c
    o = await env.place_order([(c.black.id, 10), (c.hinge_v.id, 4)])
    res = expect(await ctx.http.get(f"/api/v1/admin/orders/{o['id']}", headers=env.manager), 200).json()
    black = next(i for i in res["items"] if i["sku"] == "KR-0190-16")
    assert_matches(black["stock"], {"available": "6", "reserved": "0", "shortage": True})
    assert [t["to"] for t in res["availableTransitions"]] == ["CONFIRMED", "CANCELLED"]
    assert res["canQuote"] is True
    assert_matches(res["customer"]["customerProfile"], {"creditLimit": 0, "balanceCached": 0})


# ───────────────────────── To'g'ridan-to'g'ri tasdiqlash (NEW → CONFIRMED) ─────────────────────────


async def test_confirm_without_terms_422(env: Env):
    o = await env.place_order([(env.c.white.id, 12)])
    res = expect(await env.go(o["id"], env.manager, {"to": "CONFIRMED"}), 422)
    assert res.json()["error"]["code"] == "TERMS_REQUIRED"


async def test_confirm_sets_terms_totals_reserve_and_manager(ctx: Ctx, env: Env):
    c = env.c
    o = await env.place_order([(c.white.id, 12), (c.hinge_v.id, 4)])
    res = await env.go(
        o["id"],
        env.manager,
        {"to": "CONFIRMED", "terms": terms(deliveryFee=0, discountTotal=6_000, allowedMethods=["CASH", "CARD_TRANSFER"])},
    )
    body = expect(res, 200).json()
    assert_matches(
        body,
        {
            "status": "CONFIRMED",
            "itemsTotal": 4_676_000,
            "discountTotal": 6_000,
            "grandTotal": 4_670_000,
            "paymentTerms": "ON_DELIVERY",
            "allowedMethods": ["CASH", "CARD_TRANSFER"],
        },
    )
    assert "MANAGER" in body["manager"]["fullName"]
    assert await env.reserved(c.white.id) == "12"
    assert await env.reserved(c.hinge_v.id) == "4"
    movements = await ctx.count(StockMovement, StockMovement.order_id == o["id"], StockMovement.type == "RESERVE")
    assert movements == 2


async def test_confirm_insufficient_stock_409_nothing_reserved(ctx: Ctx, env: Env):
    c = env.c
    o = await env.place_order([(c.hinge_v.id, 4), (c.black.id, 10)])
    res = expect(await env.go(o["id"], env.manager, {"to": "CONFIRMED", "terms": terms()}), 409)
    assert_matches(
        res.json()["error"],
        {
            "code": "INSUFFICIENT_STOCK",
            "details": {"shortages": [{"sku": "KR-0190-16", "requested": "10", "available": "6"}]},
        },
    )
    assert await env.reserved(c.hinge_v.id) == "0"
    assert (await ctx.get(Order, o["id"])).status == "NEW"


async def test_warehouse_cannot_confirm(env: Env):
    o = await env.place_order([(env.c.white.id, 1)])
    res = expect(await env.go(o["id"], env.warehouse, {"to": "CONFIRMED", "terms": terms()}), 403)
    assert res.json()["error"]["code"] == "TRANSITION_FORBIDDEN_ROLE"


async def test_credit_not_allowed_without_credit_limit(env: Env):
    o = await env.place_order([(env.c.white.id, 1)])
    res = expect(await env.go(o["id"], env.manager, {"to": "CONFIRMED", "terms": terms(paymentTerms="CREDIT")}), 422)
    assert res.json()["error"]["code"] == "CREDIT_NOT_ALLOWED"


async def test_stale_version_409(env: Env):
    o = await env.place_order([(env.c.white.id, 1)])
    res = expect(await env.go(o["id"], env.manager, {"to": "CONFIRMED", "terms": terms(), "expectedVersion": 99}), 409)
    assert res.json()["error"]["code"] == "ORDER_CONFLICT"


async def test_parallel_confirm_same_stock_only_one_reserves(ctx: Ctx, env: Env):
    c = env.c
    other = await user_with_token(ctx, "CUSTOMER")
    a = await env.place_order([(c.white.id, 70)])
    b = await env.place_order([(c.white.id, 70)], who=other)
    results = await asyncio.gather(
        env.go(a["id"], env.manager, {"to": "CONFIRMED", "terms": terms()}),
        env.go(b["id"], env.admin, {"to": "CONFIRMED", "terms": terms()}),
    )
    assert sorted(r.status_code for r in results) == [200, 409]
    assert await env.reserved(c.white.id) == "70"
