"""
Buyurtma jarayoni boshidan oxirigacha (docs/02-state-machine.md): mijoz → menejer → ombor → haydovchi → to'lov.
Har qadamda status, qoldiq/rezerv, ledger va mijozga ko'rinadigan holat tekshiriladi.
"""

from decimal import Decimal

from sqlalchemy import update

from app.models import CustomerProfile, ProductVariant
from tests.support import Ctx
from tests.support_orders import API, accept, admin_order, assign_driver, cast, move, ok, place_order


async def stock(ctx: Ctx, variant_id: str) -> tuple[Decimal, Decimal]:
    v = await ctx.get(ProductVariant, variant_id)
    return v.stock_qty, v.reserved_qty


async def test_delivery_flow_to_completed(ctx: Ctx):
    k = await cast(ctx)
    order = await place_order(ctx, k, [(k.c.white.id, 4), (k.c.hinge_v.id, 10)])
    oid = order["id"]
    assert order["status"] == "NEW"
    # Savat buyurtmadan keyin bo'sh
    assert ok(await ctx.http.get(f"{API}/cart", headers=k.customer.auth))["count"] == 0

    await accept(ctx, k, oid)
    detail = await admin_order(ctx, k, oid)
    assert detail["status"] == "PREPARING"
    assert detail["manager"]["id"] == k.manager.user.id
    assert detail["grandTotal"] == 4 * 395_000 + 10 * 14_000 + 60_000
    assert await stock(ctx, k.c.white.id) == (Decimal(120), Decimal(4))

    await move(ctx, k.warehouse_user, oid, "READY")
    # Haydovchisiz jo'natib bo'lmaydi, tugma ham ko'rinmaydi
    assert "OUT_FOR_DELIVERY" not in [t["to"] for t in (await admin_order(ctx, k, oid))["availableTransitions"]]
    await move(ctx, k.manager, oid, "OUT_FOR_DELIVERY", 409)
    await assign_driver(ctx, k, oid)
    assert "OUT_FOR_DELIVERY" in [t["to"] for t in (await admin_order(ctx, k, oid))["availableTransitions"]]
    ok(await ctx.http.post(f"{API}/driver/deliveries/{oid}/start", headers=k.driver.auth, json={}))
    # Jo'natishda qoldiqdan yechiladi, rezerv bo'shaydi
    assert await stock(ctx, k.c.white.id) == (Decimal(116), Decimal(0))

    ok(await ctx.http.post(f"{API}/driver/deliveries/{oid}/deliver", headers=k.driver.auth, json={"receiverName": "Usta Ali"}))
    detail = await admin_order(ctx, k, oid)
    assert detail["status"] == "DELIVERED"
    balance = ok(await ctx.http.get(f"{API}/me/balance", headers=k.customer.auth))
    # Musbat balans — mijoz qarzdor
    assert balance["balance"] == detail["grandTotal"]

    # Menejer naqd to'lovni kiritadi va tasdiqlaydi → avtomatik COMPLETED
    pay = ok(
        await ctx.http.post(
            f"{API}/admin/payments",
            headers=k.manager.auth,
            json={"customerId": k.customer.user.id, "orderId": oid, "amount": detail["grandTotal"], "method": "CASH"},
        ),
        201,
    )
    if pay["status"] == "PENDING":
        ok(await ctx.http.post(f"{API}/admin/payments/{pay['id']}/confirm", headers=k.manager.auth, json={}))
    detail = await admin_order(ctx, k, oid)
    assert detail["status"] == "COMPLETED"
    assert detail["paidTotal"] == detail["grandTotal"]
    assert ok(await ctx.http.get(f"{API}/me/balance", headers=k.customer.auth))["balance"] == 0
    mine = ok(await ctx.http.get(f"{API}/orders/{oid}", headers=k.customer.auth))
    assert mine["status"] == "COMPLETED"
    assert [h["toStatus"] for h in detail["statusHistory"]] == [
        "NEW",
        "PREPARING",
        "READY",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "COMPLETED",
    ]


async def test_pickup_flow(ctx: Ctx):
    k = await cast(ctx)
    await ctx.db.execute(
        update(CustomerProfile).where(CustomerProfile.user_id == k.customer.user.id).values(credit_limit=5_000_000)
    )
    await ctx.db.commit()
    oid = (await place_order(ctx, k, [(k.c.black.id, 2)], delivery="PICKUP"))["id"]
    await accept(ctx, k, oid, {"paymentTerms": "CREDIT", "allowedMethods": ["CASH"]})
    await move(ctx, k.warehouse_user, oid, "READY")
    # Olib ketishda haydovchi yo'q, qabul qiluvchi ismi majburiy
    await move(ctx, k.warehouse_user, oid, "OUT_FOR_DELIVERY", 403)
    await move(ctx, k.manager, oid, "OUT_FOR_DELIVERY", 409)
    await move(ctx, k.warehouse_user, oid, "DELIVERED", 422)
    await move(ctx, k.warehouse_user, oid, "DELIVERED", receiverName="Aziz")
    detail = await admin_order(ctx, k, oid)
    # Nasiyada topshirilgach darhol yakunlanadi, qarz ledger'da qoladi
    assert detail["status"] == "COMPLETED"
    assert await stock(ctx, k.c.black.id) == (Decimal(4), Decimal(0))
    assert ok(await ctx.http.get(f"{API}/me/balance", headers=k.customer.auth))["balance"] == 2 * 420_000
