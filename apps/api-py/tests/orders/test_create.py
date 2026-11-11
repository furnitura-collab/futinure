import asyncio
import uuid
from datetime import date

from sqlalchemy import delete, update

from app.models import (
    CartItem,
    Order,
    Product,
    ProductVariant,
    User,
    VariantGroupPrice,
    Warehouse,
)
from tests.orders.helpers import TOTAL, create, create_ok, fill_cart, get_ok, put_cart
from tests.support import Ctx, assert_matches, seed_address, user_with_token

# ───────────────────────── Yaratish ─────────────────────────


async def test_create_from_cart(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    res = await create(ctx, auth, {**pickup, "comment": "Ertalab olib ketaman"})
    assert res.status_code == 201
    body = res.json()
    year = date.today().year
    assert_matches(
        body,
        {
            "number": f"MO-{year}-000001",
            "status": "NEW",
            "deliveryType": "PICKUP",
            "itemsTotal": TOTAL,
            "grandTotal": TOTAL,
            "paidTotal": 0,
            "balanceDue": TOTAL,
            "customerComment": "Ertalab olib ketaman",
            "canCancel": True,
            "pickupWarehouse": {"name": "Asosiy ombor"},
            "totalWeightKg": "540.4",
        },
    )
    assert len(body["items"]) == 2
    assert_matches(
        body["items"][0],
        {
            "sku": "KR-W980-16",
            "nameUz": "LDSP Kronospan 16 mm",
            "unit": "SHEET",
            "qty": "12",
            "requestedQty": "12",
            "unitPrice": 380_000,
            "lineTotal": 4_560_000,
            "attributes": {"color": "Oq", "decor_code": "W980"},
        },
    )
    assert len(body["statusHistory"]) == 1
    assert_matches(body["statusHistory"][0], {"fromStatus": None, "toStatus": "NEW"})
    assert "idempotencyKey" not in body
    assert await ctx.count(CartItem) == 0


async def test_price_snapshot_unaffected_by_catalog_changes(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    o = await create_ok(ctx, auth, pickup)
    await ctx.db.execute(update(ProductVariant).where(ProductVariant.id == c.white.id).values(base_price=999_000))
    await ctx.db.execute(delete(VariantGroupPrice))
    await ctx.db.execute(update(Product).where(Product.id == c.board.id).values(name_uz="Yangi nom"))
    await ctx.db.commit()
    again = await get_ok(ctx, auth, f"/api/v1/orders/{o['id']}")
    assert_matches(again["items"][0], {"nameUz": "LDSP Kronospan 16 mm", "unitPrice": 380_000})


async def test_idempotency_key_required(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    assert (await ctx.http.post("/api/v1/orders", headers=auth, json=pickup)).status_code == 400
    assert (await create(ctx, auth, pickup, "short")).status_code == 400


async def test_same_key_replay_returns_same_order_200(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    key = str(uuid.uuid4())
    first = await create(ctx, auth, pickup, key)
    assert first.status_code == 201
    second = await create(ctx, auth, pickup, key)
    assert second.status_code == 200
    assert second.headers["Idempotent-Replayed"] == "true"
    assert second.json()["id"] == first.json()["id"]
    assert await ctx.count(Order) == 1


async def test_same_key_parallel_single_order(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    key = str(uuid.uuid4())
    results = await asyncio.gather(*(create(ctx, auth, pickup, key) for _ in range(3)))
    assert sorted(r.status_code for r in results) == [200, 200, 201]
    assert len({r.json()["id"] for r in results}) == 1
    assert await ctx.count(Order) == 1


async def test_different_keys_parallel_cart_converted_once(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    results = await asyncio.gather(create(ctx, auth, pickup), create(ctx, auth, pickup))
    assert sorted(r.status_code for r in results) == [201, 409]
    conflict = next(r for r in results if r.status_code == 409)
    assert conflict.json()["error"]["code"] == "CART_EMPTY"
    assert await ctx.count(Order) == 1


async def test_empty_cart_409(ctx: Ctx, c, auth, pickup):
    res = await create(ctx, auth, pickup)
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "CART_EMPTY"


async def test_missing_name_422(ctx: Ctx, c, customer, auth, pickup):
    await fill_cart(ctx, c, auth)
    await ctx.db.execute(update(User).where(User.id == customer.user.id).values(full_name=None))
    await ctx.db.commit()
    res = await create(ctx, auth, pickup)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "PROFILE_INCOMPLETE"


async def test_out_of_stock_in_cart_409_with_line(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    await ctx.db.execute(update(ProductVariant).where(ProductVariant.id == c.hinge_v.id).values(stock_qty=0))
    await ctx.db.commit()
    res = await create(ctx, auth, pickup)
    assert res.status_code == 409
    error = res.json()["error"]
    assert error["code"] == "CART_HAS_ISSUES"
    assert len(error["details"]["lines"]) == 1
    assert_matches(error["details"]["lines"][0], {"sku": "GTV-PB-110", "issues": [{"code": "OUT_OF_STOCK"}]})
    assert error["details"]["lines"][0]["issues"] == [{"code": "OUT_OF_STOCK"}]
    assert await ctx.count(Order) == 0
    assert await ctx.count(CartItem) == 2


async def test_exceeding_stock_still_accepted(ctx: Ctx, c, auth, pickup):
    await put_cart(ctx, auth, c.black.id, 10)
    o = await create_ok(ctx, auth, pickup)
    assert o["items"][0]["qty"] == "10"


# ── Yetkazish ──


async def test_delivery_without_address_422_foreign_404(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    assert (await create(ctx, auth, {"deliveryType": "DELIVERY"})).status_code == 422
    other = await user_with_token(ctx, "CUSTOMER")
    foreign = await seed_address(ctx, other.user.id)
    assert (await create(ctx, auth, {"deliveryType": "DELIVERY", "addressId": foreign.id})).status_code == 404


async def test_address_snapshot_kept_after_address_deleted(ctx: Ctx, c, customer, auth, pickup):
    await fill_cart(ctx, c, auth)
    address = await seed_address(ctx, customer.user.id)
    o = await create_ok(ctx, auth, {"deliveryType": "DELIVERY", "addressId": address.id})
    assert (await ctx.http.delete(f"/api/v1/addresses/{address.id}", headers=auth)).status_code == 204
    again = await get_ok(ctx, auth, f"/api/v1/orders/{o['id']}")
    assert_matches(again["addressSnapshot"], {"addressText": "Toshkent, Chilonzor 5-kvartal", "floor": 2, "lat": 41.28})


async def test_delivery_date_past_and_far_rejected(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    assert (await create(ctx, auth, {**pickup, "deliveryDate": "2020-01-01"})).status_code == 422
    assert (await create(ctx, auth, {**pickup, "deliveryDate": "2099-01-01"})).status_code == 422
    assert (await create(ctx, auth, {**pickup, "deliveryDate": "2026-02-30"})).status_code == 422


async def test_inactive_warehouse_404(ctx: Ctx, c, auth, warehouse_id, pickup):
    await fill_cart(ctx, c, auth)
    await ctx.db.execute(update(Warehouse).where(Warehouse.id == warehouse_id).values(is_active=False))
    await ctx.db.commit()
    assert (await create(ctx, auth, pickup)).status_code == 404
