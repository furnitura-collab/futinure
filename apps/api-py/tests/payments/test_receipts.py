import asyncio

from sqlalchemy import select

from app.models import LedgerEntry, Upload
from tests.payments.helpers import PNG, Env, expect
from tests.support import Ctx, assert_matches, user_with_token


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
