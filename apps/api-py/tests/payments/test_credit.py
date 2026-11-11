from datetime import date

import pytest
from sqlalchemy import update

from app.models import CustomerProfile, Order
from tests.payments.helpers import Env, expect
from tests.support import Ctx, assert_matches, user_with_token

# ───────────────────────── Menejer kiritgan to'lov va yakunlash ─────────────────────────


async def test_cash_on_handover_order_completed_balance_zero(ctx: Ctx, env: Env):
    order_id = await env.order([(env.c.white.id, 12)], {"paymentTerms": "ON_DELIVERY"})
    delivered = await env.deliver(order_id)
    assert delivered.json()["status"] == "DELIVERED"
    assert (await env.profile()).balance_cached == 4_620_000

    body = {
        "customerId": env.customer.user.id,
        "orderId": order_id,
        "amount": 4_620_000,
        "method": "CASH",
        "comment": "Ombordan olib ketishda",
    }
    res = expect(await ctx.http.post("/api/v1/admin/payments", headers=env.manager, json=body), 201)
    assert_matches(res.json(), {"status": "CONFIRMED", "method": "CASH"})
    assert (await env.get_order(order_id)).status == "COMPLETED"
    assert (await env.profile()).balance_cached == 0


async def test_manager_payment_for_other_customers_order_422(ctx: Ctx, env: Env):
    order_id = await env.order([(env.c.white.id, 1)], {"paymentTerms": "ON_DELIVERY"})
    other = await user_with_token(ctx, "CUSTOMER")
    body = {"customerId": other.user.id, "orderId": order_id, "amount": 1000, "method": "CASH"}
    expect(await ctx.http.post("/api/v1/admin/payments", headers=env.manager, json=body), 422)


# ───────────────────────── Nasiya: umumiy qarz, FIFO, muddati o'tgan, akt-sverka ─────────────────────────


@pytest.fixture
async def credit_env(ctx: Ctx, env: Env) -> Env:
    await ctx.db.execute(
        update(CustomerProfile)
        .where(CustomerProfile.user_id == env.customer.user.id)
        .values(credit_limit=50_000_000, payment_term_days=10, allowed_payment_methods=["CASH", "CARD_TRANSFER"])
    )
    await ctx.db.commit()
    return env


async def two_credit_orders(env: Env) -> tuple[str, str]:
    a = await env.order([(env.c.white.id, 12)], {"paymentTerms": "CREDIT"})
    await env.deliver(a)
    b = await env.order([(env.c.hinge_v.id, 2)], {"paymentTerms": "CREDIT"})
    await env.deliver(b)
    return a, b


async def test_credit_orders_balance_and_limit(ctx: Ctx, credit_env: Env):
    env = credit_env
    await two_credit_orders(env)
    res = expect(await ctx.http.get("/api/v1/me/balance", headers=env.customer.auth), 200)
    assert_matches(
        res.json(), {"balance": 4_648_000, "creditLimit": 50_000_000, "availableCredit": 45_352_000, "overdueAmount": 0}
    )


async def test_general_debt_payment_closes_oldest_orders_fifo(ctx: Ctx, credit_env: Env):
    env = credit_env
    a, b = await two_credit_orders(env)
    too_much = await ctx.http.post(
        "/api/v1/me/payments",
        headers=env.customer.auth,
        json={"amount": 5_000_000, "method": "CARD_TRANSFER", "receiptUploadId": await env.receipt()},
    )
    assert expect(too_much, 422).json()["error"]["details"]["due"] == 4_648_000

    p = await ctx.http.post(
        "/api/v1/me/payments",
        headers=env.customer.auth,
        json={"amount": 4_630_000, "method": "CARD_TRANSFER", "receiptUploadId": await env.receipt()},
    )
    p = expect(p, 201).json()
    assert p["orderId"] is None
    expect(await env.confirm(p["id"]), 200)

    assert (await env.get_order(a)).paid_total == 4_620_000
    assert (await env.get_order(b)).paid_total == 10_000
    assert (await env.profile()).balance_cached == 18_000


async def test_overdue_debt_and_receivables_report(ctx: Ctx, credit_env: Env):
    env = credit_env
    _, b = await two_credit_orders(env)
    await ctx.db.execute(update(Order).where(Order.id == b).values(due_date=date(2020, 1, 1)))
    await ctx.db.commit()

    assert (await ctx.http.get("/api/v1/me/balance", headers=env.customer.auth)).json()["overdueAmount"] == 28_000
    overdue = expect(await ctx.http.get("/api/v1/admin/customers?overdue=true", headers=env.manager), 200)
    assert [u["id"] for u in overdue.json()["items"]] == [env.customer.user.id]

    rep = expect(await ctx.http.get("/api/v1/admin/reports/receivables", headers=env.manager), 200).json()
    assert_matches(rep, {"totalReceivable": 4_648_000, "totalOverdue": 28_000})
    assert_matches(rep["customers"][0], {"customer_id": env.customer.user.id, "overdue": 28_000})


async def test_reconciliation_opening_plus_debit_minus_credit_equals_closing(ctx: Ctx, credit_env: Env):
    env = credit_env
    await two_credit_orders(env)
    body = {"customerId": env.customer.user.id, "amount": 100_000, "method": "CASH"}
    expect(await ctx.http.post("/api/v1/admin/payments", headers=env.manager, json=body), 201)
    res = expect(await ctx.http.get("/api/v1/me/reconciliation", headers=env.customer.auth), 200).json()
    assert_matches(res, {"openingBalance": 0, "totalDebit": 4_648_000, "totalCredit": 100_000, "closingBalance": 4_548_000})
    assert [e["type"] for e in res["entries"]] == ["DEBIT", "DEBIT", "CREDIT"]
    assert res["entries"][-1]["balanceAfter"] == 4_548_000

    future = expect(await ctx.http.get("/api/v1/me/reconciliation?from=2099-01-01&to=2099-01-31", headers=env.customer.auth), 200)
    assert_matches(future.json(), {"openingBalance": 4_548_000, "closingBalance": 4_548_000, "entries": []})
    expect(await ctx.http.get("/api/v1/me/reconciliation?from=2026-02-01&to=2026-01-01", headers=env.customer.auth), 422)
