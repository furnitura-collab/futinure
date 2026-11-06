import asyncio
import uuid
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from sqlalchemy import select, update

from app.models import (
    CustomerProfile,
    LedgerEntry,
    Order,
    OrderItem,
    OrderQuote,
    OrderStatusHistory,
    ProductVariant,
    StockMovement,
    utcnow,
)
from app.modules.orders import quotes
from tests.support import Ctx, UserCtx, assert_matches, seed_address, seed_catalog, seed_warehouse, user_with_token

Auth = dict[str, str]


def expect(res: httpx.Response, status: int) -> httpx.Response:
    assert res.status_code == status, res.text
    return res


def dec(v: Decimal) -> str:
    """Prisma Decimal.toString(): ortiqcha nollarsiz"""
    return format(Decimal(v).normalize(), "f")


class Env:
    def __init__(self, ctx: Ctx, c: SimpleNamespace, customer: UserCtx, **staff: Any) -> None:
        self.ctx = ctx
        self.c = c
        self.customer = customer
        self.manager: Auth = staff["manager"]
        self.admin: Auth = staff["admin"]
        self.warehouse: Auth = staff["warehouse"]
        self.driver: Auth = staff["driver"]
        self.driver_id: str = staff["driver_id"]
        self.warehouse_id: str = staff["warehouse_id"]

    async def place_order(
        self, lines: list[tuple[str, int]], *, delivery: bool = False, who: UserCtx | None = None
    ) -> dict[str, Any]:
        who = who or self.customer
        for variant_id, qty in lines:
            expect(await self.ctx.http.put(f"/api/v1/cart/items/{variant_id}", headers=who.auth, json={"qty": qty}), 200)
        body = (
            {"deliveryType": "DELIVERY", "addressId": (await seed_address(self.ctx, who.user.id)).id}
            if delivery
            else {"deliveryType": "PICKUP", "warehouseId": self.warehouse_id}
        )
        res = await self.ctx.http.post("/api/v1/orders", headers={**who.auth, "Idempotency-Key": str(uuid.uuid4())}, json=body)
        return expect(res, 201).json()

    async def go(self, order_id: str, auth: Auth, body: dict[str, Any]) -> httpx.Response:
        return await self.ctx.http.post(f"/api/v1/admin/orders/{order_id}/transition", headers=auth, json=body)

    async def quote(self, order_id: str, body: dict[str, Any]) -> httpx.Response:
        return await self.ctx.http.post(f"/api/v1/admin/orders/{order_id}/quotes", headers=self.manager, json={**terms(), **body})

    async def reserved(self, variant_id: str) -> str:
        return dec((await self.ctx.get(ProductVariant, variant_id)).reserved_qty)

    async def stock(self, variant_id: str) -> str:
        return dec((await self.ctx.get(ProductVariant, variant_id)).stock_qty)


def terms(**over: Any) -> dict[str, Any]:
    return {"paymentTerms": "ON_DELIVERY", "allowedMethods": ["CASH"], **over}


@pytest.fixture
async def env(ctx: Ctx) -> Env:
    c = await seed_catalog(ctx)
    customer = await user_with_token(ctx, "CUSTOMER")
    manager = (await user_with_token(ctx, "MANAGER")).auth
    admin = (await user_with_token(ctx, "SUPER_ADMIN")).auth
    warehouse = (await user_with_token(ctx, "WAREHOUSE")).auth
    d = await user_with_token(ctx, "DRIVER")
    warehouse_id = (await seed_warehouse(ctx)).id
    return Env(
        ctx, c, customer,
        manager=manager, admin=admin, warehouse=warehouse, driver=d.auth, driver_id=d.user.id, warehouse_id=warehouse_id,
    )  # fmt: skip


async def accept(e: Env, order_id: str, quote_id: str, auth: Auth | None = None) -> httpx.Response:
    return await e.ctx.http.post(f"/api/v1/orders/{order_id}/quotes/{quote_id}/accept", headers=auth or e.customer.auth)


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


# ───────────────────────── Taklif (QUOTED) ─────────────────────────


async def test_quote_change_qty_add_item_customer_accepts_confirmed(ctx: Ctx, env: Env):
    c = env.c
    o = await env.place_order([(c.black.id, 10), (c.hinge_v.id, 4)])
    black_item = next(i for i in o["items"] if i["variantId"] == c.black.id)

    q = expect(
        await env.quote(
            o["id"],
            {
                "itemChanges": [{"itemId": black_item["id"], "qty": "6"}],
                "additions": [{"variantId": c.slide_v.id, "qty": 2}],
                "deliveryFee": 80_000,
                "paymentTerms": "ADVANCE",
                "advanceAmount": 500_000,
                "allowedMethods": ["CASH", "CARD_TRANSFER"],
                "note": "Qora LDSP faqat 6 ta bor",
            },
        ),
        201,
    ).json()
    assert_matches(
        q["quote"],
        {
            "version": 1,
            "status": "PENDING",
            "totals": {"itemsTotal": 2_674_000, "deliveryFee": 80_000, "grandTotal": 2_754_000},
        },
    )
    assert [line["action"] for line in q["quote"]["lines"]] == ["CHANGE", "KEEP", "ADD"]
    assert_matches(q["quote"]["lines"][0], {"oldQty": "10", "qty": "6", "oldUnitPrice": 420_000, "unitPrice": 420_000})
    assert q["order"]["status"] == "QUOTED"

    # Mijoz ko'radi
    seen = expect(await ctx.http.get(f"/api/v1/orders/{o['id']}", headers=env.customer.auth), 200)
    assert_matches(seen.json()["pendingQuote"], {"id": q["quote"]["id"], "managerNote": "Qora LDSP faqat 6 ta bor"})
    lst = expect(await ctx.http.get("/api/v1/orders", headers=env.customer.auth), 200)
    assert lst.json()["items"][0]["hasPendingQuote"] is True

    acc = expect(await accept(env, o["id"], q["quote"]["id"]), 200).json()
    assert_matches(
        acc,
        {
            "status": "CONFIRMED",
            "grandTotal": 2_754_000,
            "deliveryFee": 80_000,
            "paymentTerms": "ADVANCE",
            "advanceAmount": 500_000,
            "pendingQuote": None,
        },
    )
    black = next(i for i in acc["items"] if i["sku"] == "KR-0190-16")
    assert_matches(black, {"qty": "6", "requestedQty": "10", "lineTotal": 2_520_000})
    assert len(acc["items"]) == 3

    assert await env.reserved(c.black.id) == "6"
    assert await env.reserved(c.hinge_v.id) == "4"
    # Og'irlik yangi tarkib bo'yicha: 6 list × 45 kg + 4 × 0.1 kg (slide og'irligi kiritilmagan)
    assert acc["totalWeightKg"] == "270.4"
    # "Buyurtma asosida" tovar qoldiqsiz — band qilinmaydi
    assert await env.reserved(c.slide_v.id) == "0"


async def test_quote_replace_with_analog(ctx: Ctx, env: Env):
    c = env.c
    o = await env.place_order([(c.black.id, 10)])
    q = expect(
        await env.quote(o["id"], {"replacements": [{"itemId": o["items"][0]["id"], "variantId": c.white.id, "qty": 10}]}),
        201,
    ).json()
    assert_matches(
        q["quote"]["lines"][0],
        {"action": "REPLACE", "sku": "KR-W980-16", "unitPrice": 385_000, "replaces": {"sku": "KR-0190-16"}},
    )

    expect(await accept(env, o["id"], q["quote"]["id"]), 200)
    items = await ctx.all(select(OrderItem).where(OrderItem.order_id == o["id"]).order_by(OrderItem.created_at))
    assert [[i.sku, i.status] for i in items] == [["KR-0190-16", "REMOVED"], ["KR-W980-16", "ACTIVE"]]
    assert items[1].replaced_item_id == items[0].id
    assert await env.reserved(c.white.id) == "10"


async def test_quote_manager_price_and_remove_line(env: Env):
    c = env.c
    o = await env.place_order([(c.white.id, 12), (c.hinge_v.id, 4)])
    white, hinge = o["items"]
    q = expect(
        await env.quote(
            o["id"],
            {"itemChanges": [{"itemId": white["id"], "qty": "12", "unitPrice": 370_000}, {"itemId": hinge["id"], "qty": "0"}]},
        ),
        201,
    ).json()
    assert [line["action"] for line in q["quote"]["lines"]] == ["CHANGE", "REMOVE"]
    assert q["quote"]["totals"]["itemsTotal"] == 12 * 370_000


async def test_quote_validation_foreign_line_out_of_stock_empty_large_advance(ctx: Ctx, env: Env):
    c = env.c
    o = await env.place_order([(c.white.id, 1)])
    other = await env.place_order([(c.hinge_v.id, 2)])
    item_id = o["items"][0]["id"]

    expect(await env.quote(o["id"], {"itemChanges": [{"itemId": other["items"][0]["id"], "qty": "1"}]}), 422)

    await ctx.db.execute(update(ProductVariant).where(ProductVariant.id == c.black.id).values(stock_qty=0))
    await ctx.db.commit()
    bad = expect(await env.quote(o["id"], {"replacements": [{"itemId": item_id, "variantId": c.black.id, "qty": 1}]}), 422)
    assert_matches(bad.json()["error"], {"code": "QUOTE_INVALID_LINES"})

    res = expect(await env.quote(o["id"], {"itemChanges": [{"itemId": item_id, "qty": "0"}]}), 422)
    assert res.json()["error"]["code"] == "QUOTE_EMPTY"
    res = expect(await env.quote(o["id"], {"paymentTerms": "ADVANCE", "advanceAmount": 10_000_000}), 422)
    assert res.json()["error"]["code"] == "ADVANCE_TOO_LARGE"
    assert (await ctx.get(Order, o["id"])).status == "NEW"


async def test_quote_keep_line_exceeding_stock_warns_not_blocks(env: Env):
    o = await env.place_order([(env.c.black.id, 10)])
    q = expect(await env.quote(o["id"], {"deliveryFee": 50_000}), 201)
    assert q.json()["warnings"] == [{"sku": "KR-0190-16", "issues": [{"code": "EXCEEDS_AVAILABLE", "available": "6"}]}]


async def test_new_quote_supersedes_old(ctx: Ctx, env: Env):
    o = await env.place_order([(env.c.white.id, 12)])
    q1 = expect(await env.quote(o["id"], {"deliveryFee": 100_000}), 201).json()
    q2 = expect(await env.quote(o["id"], {"deliveryFee": 70_000}), 201).json()
    assert q2["quote"]["version"] == 2

    old = expect(await accept(env, o["id"], q1["quote"]["id"]), 409)
    assert old.json()["error"]["code"] == "QUOTE_NOT_ACTIVE"
    history = expect(await ctx.http.get(f"/api/v1/orders/{o['id']}/quotes", headers=env.customer.auth), 200)
    assert [q["status"] for q in history.json()] == ["PENDING", "SUPERSEDED"]


async def test_assigning_manager_does_not_stale_quote(ctx: Ctx, env: Env):
    o = await env.place_order([(env.c.white.id, 1)])
    q = expect(await env.quote(o["id"], {}), 201).json()
    mgr = expect(await ctx.http.get("/api/v1/admin/orders/managers", headers=env.manager), 200).json()
    expect(
        await ctx.http.patch(f"/api/v1/admin/orders/{o['id']}/assign", headers=env.admin, json={"managerId": mgr[1]["id"]}),
        200,
    )
    expect(await accept(env, o["id"], q["quote"]["id"]), 200)


async def test_reject_quote_back_to_new_comment_required(ctx: Ctx, env: Env):
    o = await env.place_order([(env.c.white.id, 12)])
    q = expect(await env.quote(o["id"], {"deliveryFee": 200_000}), 201).json()
    url = f"/api/v1/orders/{o['id']}/quotes/{q['quote']['id']}/reject"
    expect(await ctx.http.post(url, headers=env.customer.auth, json={"comment": ""}), 422)
    res = expect(await ctx.http.post(url, headers=env.customer.auth, json={"comment": "Yetkazish qimmat"}), 200)
    assert_matches(res.json(), {"status": "NEW", "pendingQuote": None, "currentQuoteId": None})

    admin1 = expect(await ctx.http.get(f"/api/v1/admin/orders/{o['id']}", headers=env.manager), 200)
    assert_matches(admin1.json()["quotes"][0], {"status": "REJECTED", "customerComment": "Yetkazish qimmat"})


async def test_other_customer_cannot_answer_quote(ctx: Ctx, env: Env):
    o = await env.place_order([(env.c.white.id, 1)])
    q = expect(await env.quote(o["id"], {}), 201).json()
    other = (await user_with_token(ctx, "CUSTOMER")).auth
    expect(await accept(env, o["id"], q["quote"]["id"], other), 404)


async def test_expired_quote_not_accepted_cron_returns_to_new(ctx: Ctx, env: Env):
    o = await env.place_order([(env.c.white.id, 1)])
    q = expect(await env.quote(o["id"], {"expiresInHours": 1}), 201).json()
    await ctx.db.execute(
        update(OrderQuote).where(OrderQuote.id == q["quote"]["id"]).values(expires_at=utcnow() - timedelta(seconds=1))
    )
    await ctx.db.commit()

    res = expect(await accept(env, o["id"], q["quote"]["id"]), 409)
    assert res.json()["error"]["code"] == "QUOTE_EXPIRED"

    assert await quotes.expire_due() == 1
    order = await ctx.get(Order, o["id"])
    assert order.status == "NEW"
    history = await ctx.all(
        select(OrderStatusHistory).where(OrderStatusHistory.order_id == o["id"]).order_by(OrderStatusHistory.created_at)
    )
    last = history[-1]
    assert (last.to_status, last.actor_id, last.comment) == ("NEW", None, "Taklif muddati o'tdi")


async def test_stock_ran_out_on_accept_409_order_stays_quoted(ctx: Ctx, env: Env):
    c = env.c
    o = await env.place_order([(c.black.id, 5)])
    q = expect(await env.quote(o["id"], {}), 201).json()
    await ctx.db.execute(update(ProductVariant).where(ProductVariant.id == c.black.id).values(stock_qty=2))
    await ctx.db.commit()
    res = expect(await accept(env, o["id"], q["quote"]["id"]), 409)
    assert res.json()["error"]["code"] == "INSUFFICIENT_STOCK"
    order = await ctx.get(Order, o["id"])
    assert order.status == "QUOTED"
    assert order.current_quote_id is not None
    assert (await ctx.get(OrderQuote, order.current_quote_id)).status == "PENDING"


async def test_no_quote_for_confirmed_order(env: Env):
    o = await env.place_order([(env.c.white.id, 1)])
    expect(await env.go(o["id"], env.manager, {"to": "CONFIRMED", "terms": terms()}), 200)
    assert expect(await env.quote(o["id"], {}), 409).json()["error"]["code"] == "QUOTE_NOT_ALLOWED"


# ───────────────────────── To'lov tekshiruvlari (CONFIRMED → PREPARING) ─────────────────────────


async def test_advance_unpaid_409_manager_cannot_override_super_admin_with_comment(env: Env):
    o = await env.place_order([(env.c.white.id, 12)])
    confirm = {"to": "CONFIRMED", "terms": terms(paymentTerms="ADVANCE", advanceAmount=1_000_000)}
    expect(await env.go(o["id"], env.manager, confirm), 200)

    res = expect(await env.go(o["id"], env.manager, {"to": "PREPARING"}), 409)
    assert_matches(res.json()["error"], {"code": "ADVANCE_NOT_PAID", "details": {"required": 1_000_000, "paid": 0}})
    override = {"to": "PREPARING", "overrideAdvance": True, "comment": "Ishonchli mijoz"}
    expect(await env.go(o["id"], env.manager, override), 409)
    expect(await env.go(o["id"], env.admin, {"to": "PREPARING", "overrideAdvance": True}), 409)
    expect(await env.go(o["id"], env.admin, override), 200)


async def test_advance_paid_passes(ctx: Ctx, env: Env):
    o = await env.place_order([(env.c.white.id, 12)])
    confirm = {"to": "CONFIRMED", "terms": terms(paymentTerms="ADVANCE", advanceAmount=1_000_000)}
    expect(await env.go(o["id"], env.manager, confirm), 200)
    await ctx.db.execute(update(Order).where(Order.id == o["id"]).values(paid_total=1_000_000))
    await ctx.db.commit()
    expect(await env.go(o["id"], env.warehouse, {"to": "PREPARING"}), 200)


async def test_credit_over_limit_requires_comment_override(ctx: Ctx, env: Env):
    await ctx.db.execute(
        update(CustomerProfile).where(CustomerProfile.user_id == env.customer.user.id).values(credit_limit=1_000_000)
    )
    await ctx.db.commit()
    o = await env.place_order([(env.c.white.id, 12)])
    expect(await env.go(o["id"], env.manager, {"to": "CONFIRMED", "terms": terms(paymentTerms="CREDIT")}), 200)

    detail = expect(await ctx.http.get(f"/api/v1/admin/orders/{o['id']}", headers=env.manager), 200)
    assert_matches(detail.json()["creditCheck"], {"creditLimit": 1_000_000, "exposureAfter": 4_620_000, "exceeds": True})

    res = expect(await env.go(o["id"], env.manager, {"to": "PREPARING"}), 409)
    assert_matches(res.json()["error"], {"code": "CREDIT_LIMIT_EXCEEDED", "details": {"exposure": 4_620_000}})
    override = {"to": "PREPARING", "overrideCreditLimit": True, "comment": "Direktor ruxsat berdi"}
    expect(await env.go(o["id"], env.manager, override), 200)


# ───────────────────────── Olib ketish oqimi (PICKUP) ─────────────────────────


async def ready_pickup(env: Env, **payment_terms: Any) -> dict[str, Any]:
    c = env.c
    o = await env.place_order([(c.white.id, 12), (c.hinge_v.id, 4)])
    expect(await env.go(o["id"], env.manager, {"to": "CONFIRMED", "terms": terms(**payment_terms)}), 200)
    expect(await env.go(o["id"], env.warehouse, {"to": "PREPARING"}), 200)
    expect(await env.go(o["id"], env.warehouse, {"to": "READY"}), 200)
    return o


async def test_pickup_handover_stock_written_off_debt_recorded_unpaid_stays_delivered(ctx: Ctx, env: Env):
    c = env.c
    o = await ready_pickup(env)
    expect(await env.go(o["id"], env.warehouse, {"to": "DELIVERED"}), 422)
    # Haydovchiga biriktirilmagan buyurtma unga ko'rinmaydi
    expect(await env.go(o["id"], env.driver, {"to": "DELIVERED", "receiverName": "Aziz"}), 404)

    res = expect(await env.go(o["id"], env.warehouse, {"to": "DELIVERED", "receiverName": "Aziz aka"}), 200).json()
    assert res["status"] == "DELIVERED"
    assert res["statusHistory"][-1]["comment"] == "Qabul qildi: Aziz aka"

    assert await env.stock(c.white.id) == "108"
    assert await env.reserved(c.white.id) == "0"
    assert await env.stock(c.hinge_v.id) == "396"

    ledger = await ctx.all(select(LedgerEntry).where(LedgerEntry.customer_id == env.customer.user.id))
    assert len(ledger) == 1
    e = ledger[0]
    assert (e.type, e.amount, e.balance_after, e.order_id) == ("DEBIT", 4_676_000, 4_676_000, o["id"])
    profile = await ctx.get(CustomerProfile, env.customer.user.id)
    assert profile.balance_cached == 4_676_000


async def test_credit_pickup_auto_completed_with_due_date(ctx: Ctx, env: Env):
    await ctx.db.execute(
        update(CustomerProfile)
        .where(CustomerProfile.user_id == env.customer.user.id)
        .values(credit_limit=10_000_000, payment_term_days=15)
    )
    await ctx.db.commit()
    o = await ready_pickup(env, paymentTerms="CREDIT")
    res = expect(await env.go(o["id"], env.warehouse, {"to": "DELIVERED", "receiverName": "Aziz"}), 200).json()
    assert res["status"] == "COMPLETED"
    assert res["dueDate"]
    assert [h["toStatus"] for h in res["statusHistory"]][-2:] == ["DELIVERED", "COMPLETED"]


async def test_fully_prepaid_completed_on_handover(ctx: Ctx, env: Env):
    o = await env.place_order([(env.c.hinge_v.id, 2)])
    expect(await env.go(o["id"], env.manager, {"to": "CONFIRMED", "terms": terms(paymentTerms="PREPAID")}), 200)
    await ctx.db.execute(update(Order).where(Order.id == o["id"]).values(paid_total=28_000))
    await ctx.db.commit()
    expect(await env.go(o["id"], env.manager, {"to": "PREPARING"}), 200)
    expect(await env.go(o["id"], env.manager, {"to": "READY"}), 200)
    res = expect(await env.go(o["id"], env.manager, {"to": "DELIVERED", "receiverName": "Aziz"}), 200)
    assert res.json()["status"] == "COMPLETED"


async def test_completed_cannot_be_set_manually(env: Env):
    o = await ready_pickup(env)
    expect(await env.go(o["id"], env.warehouse, {"to": "DELIVERED", "receiverName": "Aziz"}), 200)
    expect(await env.go(o["id"], env.admin, {"to": "COMPLETED"}), 403)


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
