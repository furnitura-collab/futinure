"""Jarayonning chekka holatlari: yetkazilmadi, bekor qilish, qoldiq, avans, qisman to'lov, parallel o'zgartirish, rollar"""

import uuid
from decimal import Decimal

from app.models import ProductVariant
from tests.support import Ctx, user_with_token
from tests.support_orders import API, accept, admin_order, assign_driver, cast, move, ok, other_customer, place_order


async def stock(ctx: Ctx, variant_id: str) -> tuple[Decimal, Decimal]:
    v = await ctx.get(ProductVariant, variant_id)
    return v.stock_qty, v.reserved_qty


async def pay(ctx: Ctx, k, oid: str, amount: int, status: int = 201):
    res = await ctx.http.post(
        f"{API}/admin/payments",
        headers=k.manager.auth,
        json={"customerId": k.customer.user.id, "orderId": oid, "amount": amount, "method": "CASH"},
    )
    assert res.status_code == status, res.text
    body = res.json()
    if status == 201 and body["status"] == "PENDING":
        ok(await ctx.http.post(f"{API}/admin/payments/{body['id']}/confirm", headers=k.manager.auth, json={}))
    return body


async def test_not_delivered_returns_stock_and_reserve(ctx: Ctx):
    k = await cast(ctx)
    oid = (await place_order(ctx, k, [(k.c.white.id, 4)]))["id"]
    await accept(ctx, k, oid)
    await move(ctx, k.warehouse_user, oid, "READY")
    await assign_driver(ctx, k, oid)
    ok(await ctx.http.post(f"{API}/driver/deliveries/{oid}/start", headers=k.driver.auth, json={}))
    assert (
        await ctx.http.post(f"{API}/driver/deliveries/{oid}/fail", headers=k.driver.auth, json={"reason": "ok"})
    ).status_code == 422
    ok(
        await ctx.http.post(
            f"{API}/driver/deliveries/{oid}/fail", headers=k.driver.auth, json={"reason": "Mijoz telefonni olmadi"}
        )
    )
    assert (await admin_order(ctx, k, oid))["status"] == "READY"
    assert await stock(ctx, k.c.white.id) == (Decimal(120), Decimal(4))


async def test_cancel_rules_release_reserve(ctx: Ctx):
    k = await cast(ctx)
    first = (await place_order(ctx, k, [(k.c.white.id, 2)]))["id"]
    ok(await ctx.http.post(f"{API}/orders/{first}/cancel", headers=k.customer.auth, json={"reason": "Adashib berdim"}))
    assert (await admin_order(ctx, k, first))["status"] == "CANCELLED"

    second = (await place_order(ctx, k, [(k.c.white.id, 3)]))["id"]
    await accept(ctx, k, second)
    # Mijoz faqat NEW'ni bekor qiladi; menejer — sabab bilan
    res = await ctx.http.post(f"{API}/orders/{second}/cancel", headers=k.customer.auth, json={"reason": "Kerak emas"})
    assert res.status_code in (403, 409), res.text
    await move(ctx, k.manager, second, "CANCELLED", 409)
    await move(ctx, k.manager, second, "CANCELLED", comment="Mijoz rad etdi")
    assert await stock(ctx, k.c.white.id) == (Decimal(120), Decimal(0))


async def test_accept_fails_when_stock_short(ctx: Ctx):
    k = await cast(ctx)
    oid = (await place_order(ctx, k, [(k.c.black.id, 5)]))["id"]
    # Boshqa mijoz oxirgi qoldiqni birinchi band qildi
    rival = (await place_order(ctx, await other_customer(ctx, k), [(k.c.black.id, 5)]))["id"]
    await accept(ctx, k, rival)
    res = await ctx.http.post(
        f"{API}/admin/orders/{oid}/transition",
        headers=k.manager.auth,
        json={"to": "PREPARING", "terms": {"paymentTerms": "ON_DELIVERY", "allowedMethods": ["CASH"]}},
    )
    assert res.status_code == 409, res.text
    assert (await admin_order(ctx, k, oid))["status"] == "NEW"
    assert await stock(ctx, k.c.black.id) == (Decimal(6), Decimal(5))


async def test_prepaid_waits_for_payment(ctx: Ctx):
    k = await cast(ctx)
    oid = (await place_order(ctx, k, [(k.c.hinge_v.id, 10)], delivery="PICKUP"))["id"]
    terms = {"paymentTerms": "PREPAID", "allowedMethods": ["CASH"]}
    ok(await ctx.http.put(f"{API}/admin/orders/{oid}/terms", headers=k.manager.auth, json={"terms": terms}))
    await move(ctx, k.manager, oid, "PREPARING", 409, terms=terms)
    await pay(ctx, k, oid, 140_000)
    await move(ctx, k.manager, oid, "PREPARING", terms=terms)
    await move(ctx, k.warehouse_user, oid, "READY")
    await move(ctx, k.warehouse_user, oid, "DELIVERED", receiverName="Aziz")
    assert (await admin_order(ctx, k, oid))["status"] == "COMPLETED"
    assert ok(await ctx.http.get(f"{API}/me/balance", headers=k.customer.auth))["balance"] == 0


async def test_partial_payment_keeps_delivered_and_overpay_rejected(ctx: Ctx):
    k = await cast(ctx)
    oid = (await place_order(ctx, k, [(k.c.hinge_v.id, 10)], delivery="PICKUP"))["id"]
    await accept(ctx, k, oid, {"paymentTerms": "ON_DELIVERY", "allowedMethods": ["CASH"]})
    await move(ctx, k.warehouse_user, oid, "READY")
    await move(ctx, k.warehouse_user, oid, "DELIVERED", receiverName="Aziz")
    await pay(ctx, k, oid, 100_000)
    assert (await admin_order(ctx, k, oid))["status"] == "DELIVERED"
    await pay(ctx, k, oid, 100_000, status=422)
    await pay(ctx, k, oid, 40_000)
    detail = await admin_order(ctx, k, oid)
    assert (detail["status"], detail["paidTotal"]) == ("COMPLETED", 140_000)


async def test_concurrent_change_conflicts(ctx: Ctx):
    k = await cast(ctx)
    oid = (await place_order(ctx, k, [(k.c.white.id, 1)]))["id"]
    version = (await admin_order(ctx, k, oid))["version"]
    await accept(ctx, k, oid)
    await move(ctx, k.warehouse_user, oid, "READY", 409, expectedVersion=version)


async def test_order_submit_is_idempotent(ctx: Ctx):
    k = await cast(ctx)
    ok(await ctx.http.put(f"{API}/cart/items/{k.c.white.id}", headers=k.customer.auth, json={"qty": 1}))
    headers = {**k.customer.auth, "Idempotency-Key": uuid.uuid4().hex}
    body = {"deliveryType": "DELIVERY", "addressId": k.address_id}
    a = ok(await ctx.http.post(f"{API}/orders", headers=headers, json=body), 201)
    b = await ctx.http.post(f"{API}/orders", headers=headers, json=body)
    assert b.status_code in (200, 201) and b.json()["id"] == a["id"], b.text
    assert ok(await ctx.http.get(f"{API}/orders", headers=k.customer.auth))["total"] == 1


async def test_roles_cannot_skip_their_lane(ctx: Ctx):
    k = await cast(ctx)
    oid = (await place_order(ctx, k, [(k.c.white.id, 1)]))["id"]
    terms = {"paymentTerms": "ON_DELIVERY", "allowedMethods": ["CASH"]}
    # Omborchi va haydovchi NEW buyurtmani qabul qila olmaydi (ko'rmaydi ham)
    for who in (k.warehouse_user, k.driver):
        res = await ctx.http.post(
            f"{API}/admin/orders/{oid}/transition", headers=who.auth, json={"to": "PREPARING", "terms": terms}
        )
        assert res.status_code in (403, 404), res.text
    assert (await ctx.http.get(f"{API}/admin/orders/{oid}", headers=k.customer.auth)).status_code == 403
    await accept(ctx, k, oid)
    await move(ctx, k.warehouse_user, oid, "READY")
    # Biriktirilmagan haydovchi boshqa buyurtmani ola olmaydi
    stranger = await user_with_token(ctx, "DRIVER")
    res = await ctx.http.post(f"{API}/driver/deliveries/{oid}/start", headers=stranger.auth, json={})
    assert res.status_code in (403, 404, 409), res.text
    # Boshqa mijoz buyurtmani ko'rmaydi
    other = await user_with_token(ctx, "CUSTOMER")
    assert (await ctx.http.get(f"{API}/orders/{oid}", headers=other.auth)).status_code == 404
