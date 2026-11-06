import asyncio
import uuid
from datetime import date
from types import SimpleNamespace
from typing import Any

import pytest
from sqlalchemy import delete, text, update

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.db import transaction
from app.models import (
    CartItem,
    Order,
    Payment,
    Product,
    ProductVariant,
    User,
    VariantGroupPrice,
    Warehouse,
)
from app.modules.orders.state_machine import transition
from tests.support import Ctx, UserCtx, assert_matches, seed_address, seed_catalog, seed_warehouse, user_with_token

TOTAL = 12 * 380_000 + 4 * 14_000


@pytest.fixture
async def c(ctx: Ctx) -> SimpleNamespace:
    # Ketma-ketlikni ham qayta boshlaymiz — raqam formatini tekshirish uchun
    await ctx.db.execute(text("ALTER SEQUENCE order_number_seq RESTART WITH 1"))
    await ctx.db.commit()
    return await seed_catalog(ctx)


@pytest.fixture
async def customer(ctx: Ctx, c: SimpleNamespace) -> UserCtx:
    return await user_with_token(ctx, "CUSTOMER", price_group_id=c.usta.id)


@pytest.fixture
async def auth(customer: UserCtx) -> dict[str, str]:
    return customer.auth


@pytest.fixture
async def warehouse_id(ctx: Ctx, customer: UserCtx) -> str:
    return (await seed_warehouse(ctx)).id


@pytest.fixture
def pickup(warehouse_id: str) -> dict[str, Any]:
    return {"deliveryType": "PICKUP", "warehouseId": warehouse_id}


async def put_cart(ctx: Ctx, auth: dict[str, str], variant_id: str, qty: int) -> None:
    res = await ctx.http.put(f"/api/v1/cart/items/{variant_id}", headers=auth, json={"qty": qty})
    assert res.status_code == 200, res.text


async def fill_cart(ctx: Ctx, c: SimpleNamespace, auth: dict[str, str]) -> None:
    await put_cart(ctx, auth, c.white.id, 12)
    await put_cart(ctx, auth, c.hinge_v.id, 4)


async def create(ctx: Ctx, auth: dict[str, str], body: dict[str, Any], key: str | None = None):
    headers = {**auth, "Idempotency-Key": key or str(uuid.uuid4())}
    return await ctx.http.post("/api/v1/orders", headers=headers, json=body)


async def create_ok(ctx: Ctx, auth: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
    res = await create(ctx, auth, body)
    assert res.status_code == 201, res.text
    return res.json()


async def cancel(ctx: Ctx, auth: dict[str, str], order_id: str, reason: str):
    return await ctx.http.post(f"/api/v1/orders/{order_id}/cancel", headers=auth, json={"reason": reason})


async def get_ok(ctx: Ctx, auth: dict[str, str] | None, url: str) -> Any:
    res = await ctx.http.get(url, headers=auth)
    assert res.status_code == 200, res.text
    return res.json()


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


# ───────────────────────── Ro'yxat va ko'rish ─────────────────────────


async def test_only_own_orders(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    o = await create_ok(ctx, auth, pickup)
    other = (await user_with_token(ctx, "CUSTOMER")).auth
    assert (await ctx.http.get(f"/api/v1/orders/{o['id']}", headers=other)).status_code == 404
    assert (await ctx.http.get("/api/v1/orders", headers=other)).json()["total"] == 0

    lst = await get_ok(ctx, auth, "/api/v1/orders")
    assert_matches(lst["items"][0], {"number": o["number"], "itemsCount": 2, "hasPendingQuote": False})


async def test_list_card_preview_and_amount_due(ctx: Ctx, c, customer, auth, pickup):
    await fill_cart(ctx, c, auth)
    o = await create_ok(ctx, auth, pickup)
    item = (await get_ok(ctx, auth, "/api/v1/orders"))["items"][0]
    assert item["preview"] == [
        {"nameUz": "LDSP Kronospan 16 mm", "nameRu": "ЛДСП Kronospan 16 мм", "qty": "12", "unit": "SHEET"},
        {"nameUz": "Petlya dovodchikli", "nameRu": "Петля с доводчиком", "qty": "4", "unit": "PIECE"},
    ]
    # Kelishilmagan buyurtmada to'lov so'ralmaydi
    assert_matches(item, {"balanceDue": TOTAL, "amountDue": 0})

    await ctx.db.execute(
        update(Order).where(Order.id == o["id"]).values(status="CONFIRMED", payment_terms="ADVANCE", advance_amount=1_000_000)
    )
    await ctx.db.commit()
    item = (await get_ok(ctx, auth, "/api/v1/orders"))["items"][0]
    assert_matches(item, {"paymentTerms": "ADVANCE", "amountDue": 1_000_000})

    # Tekshirilayotgan chek summasi qayta so'ralmaydi
    await ctx.add(
        Payment(
            order_id=o["id"],
            customer_id=customer.user.id,
            created_by=customer.user.id,
            amount=400_000,
            method="CARD_TRANSFER",
            status="PENDING",
        )
    )
    item = (await get_ok(ctx, auth, "/api/v1/orders"))["items"][0]
    assert item["amountDue"] == 600_000
    assert (await get_ok(ctx, auth, f"/api/v1/orders/{o['id']}"))["amountDue"] == 600_000


async def test_active_finished_filter(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    o = await create_ok(ctx, auth, pickup)
    assert (await cancel(ctx, auth, o["id"], "Fikrim o'zgardi")).status_code == 200
    assert (await ctx.http.get("/api/v1/orders?active=true", headers=auth)).json()["total"] == 0
    assert (await ctx.http.get("/api/v1/orders?active=false", headers=auth)).json()["total"] == 1


# ───────────────────────── Bekor qilish ─────────────────────────


async def test_cancel_new_with_reason_and_history(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    o = await create_ok(ctx, auth, pickup)
    res = await cancel(ctx, auth, o["id"], "Boshqa joydan oldim")
    assert res.status_code == 200
    assert_matches(res.json(), {"status": "CANCELLED", "cancelReason": "Boshqa joydan oldim", "canCancel": False})
    assert [h["toStatus"] for h in res.json()["statusHistory"]] == ["NEW", "CANCELLED"]


async def test_cancel_without_reason_422_twice_409(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    o = await create_ok(ctx, auth, pickup)
    assert (await cancel(ctx, auth, o["id"], "")).status_code == 422
    assert (await cancel(ctx, auth, o["id"], "Kerak emas")).status_code == 200
    res = await cancel(ctx, auth, o["id"], "Kerak emas")
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "TRANSITION_NO_SUCH_TRANSITION"


async def test_customer_cannot_cancel_confirmed_403(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    o = await create_ok(ctx, auth, pickup)
    await ctx.db.execute(update(Order).where(Order.id == o["id"]).values(status="CONFIRMED"))
    await ctx.db.commit()
    res = await cancel(ctx, auth, o["id"], "Kerak emas")
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "TRANSITION_FORBIDDEN_ROLE"


async def test_optimistic_lock_stale_version_rejected(ctx: Ctx, c, customer, auth, pickup):
    await fill_cart(ctx, c, auth)
    o = await create_ok(ctx, auth, pickup)
    order = await ctx.get(Order, o["id"])
    # findUniqueOrThrow nusxasi — keyingi o'zgarishdan oldingi versiya
    stale = SimpleNamespace(id=order.id, status=order.status, version=order.version, delivery_type=order.delivery_type)
    # Kimdir orada o'zgartirdi
    await ctx.db.execute(update(Order).where(Order.id == order.id).values(version=Order.version + 1))
    await ctx.db.commit()
    with pytest.raises(AppError) as exc:
        async with transaction(ctx.db):
            await transition(ctx.db, stale, "CANCELLED", AuthUser(customer.user.id, "CUSTOMER"), comment="x")
    assert exc.value.code == "ORDER_CONFLICT"


# ───────────────────────── Yana buyurtma qilish (/me/buy-again) ─────────────────────────


async def test_buy_again_latest_first_last_qty_current_price(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    await create_ok(ctx, auth, pickup)
    await put_cart(ctx, auth, c.white.id, 3)
    await create_ok(ctx, auth, pickup)

    body = await get_ok(ctx, auth, "/api/v1/me/buy-again")
    assert [i["sku"] for i in body] == ["KR-W980-16", "GTV-PB-110"]
    assert_matches(
        body[0],
        {
            "variantId": c.white.id,
            "lastQty": "3",
            "unitPrice": 380_000,
            "stockLevel": "IN_STOCK",
            "attributes": {"color": "Oq", "decor_code": "W980"},
            "product": {"id": c.board.id, "nameUz": "LDSP Kronospan 16 mm"},
        },
    )
    assert_matches(body[1], {"lastQty": "4", "product": {"id": c.hinge.id, "variantId": c.hinge_v.id}})


async def test_buy_again_excludes_cancelled_inactive_and_foreign(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    o = await create_ok(ctx, auth, pickup)
    await put_cart(ctx, auth, c.slide_v.id, 1)
    await create_ok(ctx, auth, pickup)
    assert (await cancel(ctx, auth, o["id"], "Kerak emas")).status_code == 200
    assert [i["sku"] for i in await get_ok(ctx, auth, "/api/v1/me/buy-again")] == ["GTV-SL-500"]

    await ctx.db.execute(update(ProductVariant).where(ProductVariant.id == c.slide_v.id).values(is_active=False))
    await ctx.db.commit()
    assert await get_ok(ctx, auth, "/api/v1/me/buy-again") == []

    other = (await user_with_token(ctx, "CUSTOMER")).auth
    assert await get_ok(ctx, other, "/api/v1/me/buy-again") == []


async def test_buy_again_customer_only(ctx: Ctx, c, auth, pickup):
    m = (await user_with_token(ctx, "MANAGER")).auth
    assert (await ctx.http.get("/api/v1/me/buy-again", headers=m)).status_code == 403
    assert (await ctx.http.get("/api/v1/me/buy-again")).status_code == 401


# ───────────────────────── Qayta buyurtma ─────────────────────────


async def test_reorder_adds_to_cart_with_price_diff_skips_inactive(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    o = await create_ok(ctx, auth, pickup)
    # Guruh narxi qimmatladi — endi 10+ list pog'onasi (385 000) arzonroq
    await ctx.db.execute(update(VariantGroupPrice).values(price=390_000))
    await ctx.db.execute(update(ProductVariant).where(ProductVariant.id == c.hinge_v.id).values(is_active=False))
    await ctx.db.commit()

    res = await ctx.http.post(f"/api/v1/cart/reorder/{o['id']}", headers=auth)
    assert res.status_code == 200
    body = res.json()
    assert body["added"] == [{"sku": "KR-W980-16", "qty": "12", "oldUnitPrice": 380_000, "newUnitPrice": 385_000}]
    assert body["skipped"] == [{"sku": "GTV-PB-110", "reason": "INACTIVE"}]
    assert body["cart"]["count"] == 1


async def test_reorder_foreign_order_404(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    o = await create_ok(ctx, auth, pickup)
    other = (await user_with_token(ctx, "CUSTOMER")).auth
    assert (await ctx.http.post(f"/api/v1/cart/reorder/{o['id']}", headers=other)).status_code == 404
