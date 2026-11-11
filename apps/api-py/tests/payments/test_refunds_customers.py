from sqlalchemy import update

from app.auth import tokens
from app.models import CustomerProfile
from tests.payments.helpers import Env, expect
from tests.support import Ctx, assert_matches

# ───────────────────────── Pul qaytarish va tuzatish ─────────────────────────


async def test_cancelled_order_advance_refunded_super_admin_only(ctx: Ctx, env: Env):
    order_id = await env.order([(env.c.white.id, 12)], {"paymentTerms": "ADVANCE", "advanceAmount": 1_000_000})
    p = expect(await env.report(order_id, 1_000_000), 201).json()
    expect(await env.confirm(p["id"]), 200)
    expect(await env.go(order_id, {"to": "CANCELLED", "comment": "Mijoz voz kechdi"}), 200)
    assert (await env.profile()).balance_cached == -1_000_000

    url = f"/api/v1/admin/customers/{env.customer.user.id}/refunds"
    body = {"amount": 1_000_000, "method": "CASH", "description": "Avans qaytarildi"}
    expect(await ctx.http.post(url, headers=env.manager, json=body), 403)
    res = expect(await ctx.http.post(url, headers=env.admin, json={**body, "amount": 1_500_000}), 422)
    assert res.json()["error"]["details"]["available"] == 1_000_000
    expect(await ctx.http.post(url, headers=env.admin, json=body), 201)
    assert (await env.profile()).balance_cached == 0


async def test_manual_adjustment_old_debt(ctx: Ctx, env: Env):
    res = await ctx.http.post(
        f"/api/v1/admin/customers/{env.customer.user.id}/ledger/adjust",
        headers=env.admin,
        json={"amount": 2_500_000, "description": "Eski daftardan ko'chirilgan qarz"},
    )
    assert_matches(expect(res, 201).json(), {"type": "ADJUSTMENT", "amount": 2_500_000, "balanceAfter": 2_500_000})
    ledger = expect(await ctx.http.get("/api/v1/me/ledger", headers=env.customer.auth), 200)
    assert ledger.json()["total"] == 1


# ───────────────────────── Admin: mijozlar ─────────────────────────


async def test_manager_changes_group_only_super_admin_changes_limit(ctx: Ctx, env: Env):
    url = f"/api/v1/admin/customers/{env.customer.user.id}"
    res = expect(await ctx.http.patch(url, headers=env.manager, json={"priceGroupId": env.c.usta.id, "type": "MASTER"}), 200)
    assert_matches(res.json()["customerProfile"], {"type": "MASTER", "priceGroup": {"name": "Usta"}})
    expect(await ctx.http.patch(url, headers=env.manager, json={"creditLimit": 5_000_000}), 403)
    ok = expect(await ctx.http.patch(url, headers=env.admin, json={"creditLimit": 5_000_000, "paymentTermDays": 15}), 200)
    assert_matches(ok.json()["finance"], {"creditLimit": 5_000_000, "paymentTermDays": 15})


async def test_blocking_closes_sessions(ctx: Ctx, env: Env):
    login = await tokens.issue(ctx.db, env.customer.user.id, env.customer.user.role)
    url = f"/api/v1/admin/customers/{env.customer.user.id}"
    expect(await ctx.http.patch(url, headers=env.manager, json={"isActive": False}), 200)
    expect(await ctx.http.post("/api/v1/auth/refresh", json={"refreshToken": login["refreshToken"]}), 401)


async def test_search_and_debtors_filter(ctx: Ctx, env: Env):
    await ctx.db.execute(
        update(CustomerProfile)
        .where(CustomerProfile.user_id == env.customer.user.id)
        .values(company_name="Aziz Mebel MChJ", balance_cached=100)
    )
    await ctx.db.commit()
    assert (await ctx.http.get("/api/v1/admin/customers?q=aziz", headers=env.manager)).json()["total"] == 1
    assert (await ctx.http.get("/api/v1/admin/customers?debtors=true", headers=env.manager)).json()["total"] == 1
    detail = expect(await ctx.http.get(f"/api/v1/admin/customers/{env.customer.user.id}", headers=env.manager), 200)
    assert_matches(detail.json(), {"finance": {"balance": 100}, "stats": {"orders": 0}})
