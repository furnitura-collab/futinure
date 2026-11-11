import pytest
from sqlalchemy import select

from app.models import Notification, Order, OutboxEvent
from app.modules.notifications import dispatcher
from tests.admin_orders.helpers import Env, expect, terms
from tests.support import Ctx, assert_matches

# ───────────────────────── Shartlarni oldindan saqlash (PUT /terms) ─────────────────────────


async def customer_notes(ctx: Ctx, env: Env) -> list[str]:
    await dispatcher.drain()
    rows = await ctx.all(select(Notification).where(Notification.user_id == env.customer.user.id))
    return [n.type for n in rows]


async def test_terms_saved_status_stays_new_version_bumped(ctx: Ctx, env: Env):
    o = await env.place_order([(env.c.white.id, 12)])
    before = (await ctx.get(Order, o["id"])).version
    body = {"terms": terms(paymentTerms="ADVANCE", advanceAmount=1_000_000, deliveryFee=0, discountTotal=20_000)}
    res = expect(await env.set_terms(o["id"], env.manager, {**body, "expectedVersion": before}), 200).json()
    assert_matches(
        res,
        {
            "status": "NEW",
            "paymentTerms": "ADVANCE",
            "advanceAmount": 1_000_000,
            "discountTotal": 20_000,
            "grandTotal": 4_600_000,
            "canSetTerms": True,
        },
    )
    assert "MANAGER" in res["manager"]["fullName"]
    order = await ctx.get(Order, o["id"])
    assert (order.version, order.confirmed_at) == (before + 1, None)
    # Rezerv faqat qabul qilinganda
    assert await env.reserved(env.c.white.id) == "0"
    assert await ctx.count(OutboxEvent, OutboxEvent.type == "order.terms_set") == 1
    # Eski versiya bilan qayta yozib bo'lmaydi
    stale = expect(await env.set_terms(o["id"], env.manager, {**body, "expectedVersion": before}), 409)
    assert stale.json()["error"]["code"] == "ORDER_CONFLICT"


@pytest.mark.parametrize(
    ("payment", "expected"),
    [
        ({"paymentTerms": "ADVANCE", "advanceAmount": 1_000_000}, ["order.terms_set"]),
        ({"paymentTerms": "PREPAID"}, ["order.terms_set"]),
        ({"paymentTerms": "ON_DELIVERY"}, []),
    ],
)
async def test_terms_notify_customer_only_when_payment_needed(ctx: Ctx, env: Env, payment: dict, expected: list[str]):
    o = await env.place_order([(env.c.white.id, 12)])
    await dispatcher.drain()
    expect(await env.set_terms(o["id"], env.manager, {"terms": terms(**payment)}), 200)
    assert await customer_notes(ctx, env) == expected


async def test_terms_set_message_shows_amount(ctx: Ctx, env: Env):
    o = await env.place_order([(env.c.white.id, 12)])
    expect(await env.set_terms(o["id"], env.manager, {"terms": terms(paymentTerms="PREPAID")}), 200)
    await dispatcher.drain()
    n = await ctx.first(select(Notification).where(Notification.type == "order.terms_set"))
    assert n is not None
    assert (n.title, n.payload) == ("To'lov kutilmoqda", {"orderId": o["id"]})
    assert n.body.startswith(f"{o['number']}: 4 620 000 so'm to'lang")


async def test_terms_only_new_and_staff_only(env: Env):
    o = await env.place_order([(env.c.white.id, 1)])
    expect(await env.set_terms(o["id"], env.warehouse, {"terms": terms()}), 403)
    expect(await env.set_terms(o["id"], env.customer.auth, {"terms": terms()}), 403)
    expect(await env.set_terms(o["id"], env.manager, {"terms": terms(paymentTerms="CREDIT")}), 422)

    expect(await env.go(o["id"], env.manager, {"to": "PREPARING", "terms": terms()}), 200)
    res = expect(await env.set_terms(o["id"], env.manager, {"terms": terms()}), 409)
    assert_matches(res.json()["error"], {"code": "TERMS_ONLY_NEW", "details": {"status": "PREPARING"}})


# ───────────────────────── Oldindan to'lov oqimi ─────────────────────────


async def test_prepay_flow_terms_payment_then_accept(ctx: Ctx, env: Env):
    o = await env.place_order([(env.c.white.id, 12)])
    advance = terms(paymentTerms="ADVANCE", advanceAmount=1_000_000)
    expect(await env.set_terms(o["id"], env.manager, {"terms": advance}), 200)

    # Mijoz to'lov qilmaguncha qabul qilinmaydi (saqlangan shartlar bo'yicha)
    res = expect(await env.go(o["id"], env.manager, {"to": "PREPARING"}), 409)
    assert_matches(res.json()["error"], {"code": "ADVANCE_NOT_PAID", "details": {"required": 1_000_000, "paid": 0}})
    seen = expect(await ctx.http.get(f"/api/v1/orders/{o['id']}", headers=env.customer.auth), 200).json()
    assert_matches(seen, {"status": "NEW", "amountDue": 1_000_000})
    assert "pendingQuote" not in seen

    body = {"customerId": env.customer.user.id, "orderId": o["id"], "amount": 1_000_000, "method": "CASH"}
    paid = expect(await ctx.http.post("/api/v1/admin/payments", headers=env.manager, json=body), 201)
    assert paid.json()["status"] == "CONFIRMED"

    res = expect(await env.go(o["id"], env.manager, {"to": "PREPARING"}), 200).json()
    assert_matches(res, {"status": "PREPARING", "paidTotal": 1_000_000, "paymentTerms": "ADVANCE"})
    assert await env.reserved(env.c.white.id) == "12"
    assert (await ctx.get(Order, o["id"])).confirmed_at is not None


async def test_terms_sent_on_accept_override_saved(env: Env):
    o = await env.place_order([(env.c.white.id, 12)])
    expect(await env.set_terms(o["id"], env.manager, {"terms": terms(paymentTerms="PREPAID")}), 200)
    # Menejer fikrini o'zgartirdi: qabulda yangi shartlar yuboriladi — eskisi bo'yicha avans talab qilinmaydi
    res = expect(await env.go(o["id"], env.manager, {"to": "PREPARING", "terms": terms(deliveryFee=10_000)}), 200).json()
    assert_matches(res, {"status": "PREPARING", "paymentTerms": "ON_DELIVERY", "deliveryFee": 10_000})


async def test_warehouse_accept_forbidden_before_terms_and_payment_checks(env: Env):
    """Ruxsat yo'q bo'lsa — 403, shartlar yoki avans xatosi emas"""
    o = await env.place_order([(env.c.white.id, 1)])
    unpaid = {"to": "PREPARING", "terms": terms(paymentTerms="ADVANCE", advanceAmount=1_000_000)}
    expect(await env.go(o["id"], env.warehouse, unpaid), 403)
    expect(await env.go(o["id"], env.warehouse, {"to": "PREPARING", "terms": terms(paymentTerms="CREDIT")}), 403)
