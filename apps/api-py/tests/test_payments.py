import asyncio
import base64
import uuid
from datetime import date
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from sqlalchemy import select, update

from app.auth import tokens
from app.models import CustomerProfile, LedgerEntry, Order, Setting, Upload
from tests.support import Ctx, UserCtx, assert_matches, seed_catalog, seed_warehouse, user_with_token

Auth = dict[str, str]

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")


def expect(res: httpx.Response, status: int) -> httpx.Response:
    assert res.status_code == status, res.text
    return res


class Env:
    def __init__(self, ctx: Ctx, c: SimpleNamespace, customer: UserCtx, manager: Auth, admin: Auth, warehouse_id: str):
        self.ctx = ctx
        self.c = c
        self.customer = customer
        self.manager = manager
        self.admin = admin
        self.warehouse_id = warehouse_id

    async def order(self, lines: list[tuple[str, int]], terms: dict[str, Any], who: UserCtx | None = None) -> str:
        who = who or self.customer
        for variant_id, qty in lines:
            expect(await self.ctx.http.put(f"/api/v1/cart/items/{variant_id}", headers=who.auth, json={"qty": qty}), 200)
        res = await self.ctx.http.post(
            "/api/v1/orders",
            headers={**who.auth, "Idempotency-Key": str(uuid.uuid4())},
            json={"deliveryType": "PICKUP", "warehouseId": self.warehouse_id},
        )
        order_id: str = expect(res, 201).json()["id"]
        if terms:
            body = {"to": "CONFIRMED", "terms": {"allowedMethods": ["CASH", "CARD_TRANSFER"], **terms}}
            expect(await self.go(order_id, body), 200)
        return order_id

    async def go(self, order_id: str, body: dict[str, Any], auth: Auth | None = None) -> httpx.Response:
        return await self.ctx.http.post(f"/api/v1/admin/orders/{order_id}/transition", headers=auth or self.manager, json=body)

    async def deliver(self, order_id: str) -> httpx.Response:
        expect(await self.go(order_id, {"to": "PREPARING", "overrideCreditLimit": True, "comment": "test"}), 200)
        expect(await self.go(order_id, {"to": "READY"}), 200)
        return expect(await self.go(order_id, {"to": "DELIVERED", "receiverName": "Aziz"}), 200)

    async def upload(self, auth: Auth, content: bytes, filename: str, mime: str) -> httpx.Response:
        return await self.ctx.http.post("/api/v1/uploads/receipts", headers=auth, files={"file": (filename, content, mime)})

    async def receipt(self, auth: Auth | None = None) -> str:
        res = await self.upload(auth or self.customer.auth, PNG, "chek.png", "image/png")
        return expect(res, 201).json()["id"]

    async def report(self, order_id: str, amount: int, **extra: Any) -> httpx.Response:
        body = {"amount": amount, "method": "CARD_TRANSFER", "receiptUploadId": await self.receipt(), **extra}
        return await self.ctx.http.post(f"/api/v1/orders/{order_id}/payments", headers=self.customer.auth, json=body)

    async def confirm(self, payment_id: str, auth: Auth | None = None) -> httpx.Response:
        return await self.ctx.http.post(f"/api/v1/admin/payments/{payment_id}/confirm", headers=auth or self.manager)

    async def profile(self) -> CustomerProfile:
        return await self.ctx.get(CustomerProfile, self.customer.user.id)

    async def get_order(self, order_id: str) -> Order:
        return await self.ctx.get(Order, order_id)


@pytest.fixture
async def env(ctx: Ctx) -> Env:
    c = await seed_catalog(ctx)
    customer = await user_with_token(ctx, "CUSTOMER")
    manager = (await user_with_token(ctx, "MANAGER")).auth
    admin = (await user_with_token(ctx, "SUPER_ADMIN")).auth
    warehouse_id = (await seed_warehouse(ctx)).id
    await ctx.add(Setting(key="payment.card", value={"number": "8600 1234", "holder": "MEBEL"}))
    return Env(ctx, c, customer, manager, admin, warehouse_id)


async def test_payment_info_public(ctx: Ctx, env: Env):
    res = expect(await ctx.http.get("/api/v1/payment-info"), 200)
    assert res.json() == {"card": {"number": "8600 1234", "holder": "MEBEL"}, "bank": None}


# ───────────────────────── Chek yuklash ─────────────────────────


async def test_receipt_image_accepted_text_rejected_staff_forbidden(env: Env):
    res = expect(await env.upload(env.customer.auth, PNG, "chek.png", "image/png"), 201)
    assert_matches(res.json(), {"mimeType": "image/png"})
    expect(await env.upload(env.customer.auth, b"salom dunyo salom", "x.pdf", "application/pdf"), 415)
    expect(await env.upload(env.manager, PNG, "x.png", "image/png"), 403)


async def test_pdf_receipt_accepted(env: Env):
    pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    res = expect(await env.upload(env.customer.auth, pdf, "chek.pdf", "application/pdf"), 201)
    assert res.json()["mimeType"] == "application/pdf"


# ───────────────────────── Buyurtma uchun to'lov (chek bilan) ─────────────────────────


async def test_unconfirmed_order_not_payable(env: Env):
    order_id = await env.order([(env.c.white.id, 12)], {})
    assert expect(await env.report(order_id, 1000), 409).json()["error"]["code"] == "ORDER_NOT_PAYABLE"


async def test_method_not_agreed_422(env: Env):
    order_id = await env.order([(env.c.white.id, 12)], {"paymentTerms": "ON_DELIVERY", "allowedMethods": ["CASH"]})
    assert expect(await env.report(order_id, 1000), 422).json()["error"]["code"] == "METHOD_NOT_ALLOWED"


async def test_amount_exceeds_due_422_pending_counted(env: Env):
    order_id = await env.order([(env.c.white.id, 12)], {"paymentTerms": "ON_DELIVERY"})
    res = expect(await env.report(order_id, 4_620_001), 422)
    assert_matches(res.json()["error"], {"code": "AMOUNT_EXCEEDS_DUE", "details": {"due": 4_620_000}})
    expect(await env.report(order_id, 4_000_000), 201)
    assert expect(await env.report(order_id, 1_000_000), 422).json()["error"]["details"]["due"] == 620_000


async def test_foreign_receipt_404_same_receipt_twice_409(ctx: Ctx, env: Env):
    order_id = await env.order([(env.c.white.id, 12)], {"paymentTerms": "ON_DELIVERY"})
    other = await user_with_token(ctx, "CUSTOMER")
    foreign = await env.receipt(other.auth)
    expect(await env.report(order_id, 1000, receiptUploadId=foreign), 404)
    mine = await env.receipt()
    expect(await env.report(order_id, 1000, receiptUploadId=mine), 201)
    res = expect(await env.report(order_id, 1000, receiptUploadId=mine), 409)
    assert res.json()["error"]["code"] == "RECEIPT_ALREADY_USED"


async def test_advance_customer_reports_manager_confirms_ledger_order_preparing(ctx: Ctx, env: Env):
    order_id = await env.order([(env.c.white.id, 12)], {"paymentTerms": "ADVANCE", "advanceAmount": 1_000_000})
    p = expect(await env.report(order_id, 1_000_000), 201).json()
    assert_matches(p, {"status": "PENDING", "amount": 1_000_000, "receipt": {"mimeType": "image/png"}})
    expect(await env.go(order_id, {"to": "PREPARING"}), 409)

    queue = expect(await ctx.http.get("/api/v1/admin/payments?status=PENDING", headers=env.manager), 200)
    assert [x["id"] for x in queue.json()["items"]] == [p["id"]]
    balance = await ctx.http.get("/api/v1/me/balance", headers=env.customer.auth)
    assert balance.json()["pendingPayments"] == 1_000_000

    ok = expect(await env.confirm(p["id"]), 200)
    assert_matches(ok.json(), {"status": "CONFIRMED", "order": {"paidTotal": 1_000_000}})

    ledger = await ctx.all(select(LedgerEntry).where(LedgerEntry.customer_id == env.customer.user.id))
    assert [(e.type, e.amount, e.balance_after, e.payment_id) for e in ledger] == [("CREDIT", -1_000_000, -1_000_000, p["id"])]
    assert (await env.profile()).balance_cached == -1_000_000
    expect(await env.go(order_id, {"to": "PREPARING"}), 200)


async def test_cannot_confirm_twice_even_in_parallel(ctx: Ctx, env: Env):
    order_id = await env.order([(env.c.white.id, 12)], {"paymentTerms": "ON_DELIVERY"})
    p = expect(await env.report(order_id, 500_000), 201).json()
    a, b = await asyncio.gather(env.confirm(p["id"]), env.confirm(p["id"], env.admin))
    assert sorted([a.status_code, b.status_code]) == [200, 409]
    assert await ctx.count(LedgerEntry) == 1
    assert (await env.get_order(order_id)).paid_total == 500_000


async def test_reject_not_in_ledger_reason_saved(ctx: Ctx, env: Env):
    order_id = await env.order([(env.c.white.id, 12)], {"paymentTerms": "ON_DELIVERY"})
    p = expect(await env.report(order_id, 500_000), 201).json()
    url = f"/api/v1/admin/payments/{p['id']}/reject"
    expect(await ctx.http.post(url, headers=env.manager, json={"reason": ""}), 422)
    res = expect(await ctx.http.post(url, headers=env.manager, json={"reason": "Chekda summa boshqa"}), 200)
    assert_matches(res.json(), {"status": "REJECTED", "rejectReason": "Chekda summa boshqa"})
    assert await ctx.count(LedgerEntry) == 0
    expect(await env.confirm(p["id"]), 409)


async def test_receipt_visible_to_owner_and_manager_only_static_path_closed(ctx: Ctx, env: Env):
    order_id = await env.order([(env.c.white.id, 12)], {"paymentTerms": "ON_DELIVERY"})
    p = expect(await env.report(order_id, 500_000), 201).json()
    url = f"/api/v1/payments/{p['id']}/receipt"
    own = expect(await ctx.http.get(url, headers=env.customer.auth), 200)
    assert own.headers["content-type"] == "image/png"
    assert own.content == PNG
    expect(await ctx.http.get(url, headers=env.manager), 200)
    expect(await ctx.http.get(url, headers=(await user_with_token(ctx, "CUSTOMER")).auth), 404)
    expect(await ctx.http.get(url, headers=(await user_with_token(ctx, "WAREHOUSE")).auth), 403)

    upload = await ctx.first(select(Upload))
    assert upload is not None
    expect(await ctx.http.get(f"/uploads/private/{upload.storage_path}"), 404)


async def test_pending_payments_count_limited(env: Env):
    order_id = await env.order([(env.c.white.id, 12)], {"paymentTerms": "ON_DELIVERY"})
    for _ in range(5):
        expect(await env.report(order_id, 1000), 201)
    assert expect(await env.report(order_id, 1000), 429).json()["error"]["code"] == "TOO_MANY_PENDING"


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
