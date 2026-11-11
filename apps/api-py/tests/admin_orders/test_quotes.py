from datetime import timedelta

from sqlalchemy import select, update

from app.models import (
    Order,
    OrderItem,
    OrderQuote,
    OrderStatusHistory,
    ProductVariant,
    utcnow,
)
from app.modules.orders import quotes
from tests.admin_orders.helpers import Env, accept, expect, terms
from tests.support import Ctx, assert_matches, user_with_token

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
