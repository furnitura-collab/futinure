from typing import Any

from sqlalchemy import select, update

from app.models import (
    CustomerProfile,
    LedgerEntry,
    Order,
)
from tests.admin_orders.helpers import Env, expect, terms
from tests.support import Ctx, assert_matches

# ───────────────────────── To'lov tekshiruvlari (NEW → PREPARING) ─────────────────────────


async def test_advance_unpaid_409_manager_cannot_override_super_admin_with_comment(ctx: Ctx, env: Env):
    o = await env.place_order([(env.c.white.id, 12)])
    accept = {"to": "PREPARING", "terms": terms(paymentTerms="ADVANCE", advanceAmount=1_000_000)}
    res = expect(await env.go(o["id"], env.manager, accept), 409)
    assert_matches(res.json()["error"], {"code": "ADVANCE_NOT_PAID", "details": {"required": 1_000_000, "paid": 0}})
    # Rad etilgan o'tish shartlarni ham saqlamaydi
    assert (await ctx.get(Order, o["id"])).payment_terms is None

    override = {**accept, "overrideAdvance": True, "comment": "Ishonchli mijoz"}
    expect(await env.go(o["id"], env.manager, override), 409)
    expect(await env.go(o["id"], env.admin, {**accept, "overrideAdvance": True}), 409)
    expect(await env.go(o["id"], env.admin, override), 200)


async def test_advance_paid_passes_with_saved_terms(ctx: Ctx, env: Env):
    o = await env.place_order([(env.c.white.id, 12)])
    expect(await env.set_terms(o["id"], env.manager, {"terms": terms(paymentTerms="ADVANCE", advanceAmount=1_000_000)}), 200)
    await ctx.db.execute(update(Order).where(Order.id == o["id"]).values(paid_total=1_000_000))
    await ctx.db.commit()
    # Omborchi yangi buyurtmani qabul qila olmaydi
    expect(await env.go(o["id"], env.warehouse, {"to": "PREPARING"}), 403)
    res = expect(await env.go(o["id"], env.manager, {"to": "PREPARING"}), 200)
    assert_matches(res.json(), {"status": "PREPARING", "paymentTerms": "ADVANCE", "advanceAmount": 1_000_000})


async def test_credit_over_limit_requires_comment_override(ctx: Ctx, env: Env):
    await ctx.db.execute(
        update(CustomerProfile).where(CustomerProfile.user_id == env.customer.user.id).values(credit_limit=1_000_000)
    )
    await ctx.db.commit()
    o = await env.place_order([(env.c.white.id, 12)])
    expect(await env.set_terms(o["id"], env.manager, {"terms": terms(paymentTerms="CREDIT")}), 200)

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
    expect(await env.go(o["id"], env.manager, {"to": "PREPARING", "terms": terms(**payment_terms)}), 200)
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
    expect(await env.set_terms(o["id"], env.manager, {"terms": terms(paymentTerms="PREPAID")}), 200)
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
