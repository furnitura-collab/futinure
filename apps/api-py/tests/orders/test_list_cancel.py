from types import SimpleNamespace

import pytest
from sqlalchemy import update

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.db import transaction
from app.models import (
    Order,
    Payment,
)
from app.modules.orders.state_machine import transition
from tests.orders.helpers import TOTAL, cancel, create_ok, fill_cart, get_ok
from tests.support import Ctx, assert_matches, user_with_token

# ───────────────────────── Ro'yxat va ko'rish ─────────────────────────


async def test_only_own_orders(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    o = await create_ok(ctx, auth, pickup)
    other = (await user_with_token(ctx, "CUSTOMER")).auth
    assert (await ctx.http.get(f"/api/v1/orders/{o['id']}", headers=other)).status_code == 404
    assert (await ctx.http.get("/api/v1/orders", headers=other)).json()["total"] == 0

    lst = await get_ok(ctx, auth, "/api/v1/orders")
    assert_matches(lst["items"][0], {"number": o["number"], "itemsCount": 2})
    assert "hasPendingQuote" not in lst["items"][0]


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

    # Shartlar saqlangan yangi buyurtma (oldindan to'lov) — avans so'raladi
    await ctx.db.execute(update(Order).where(Order.id == o["id"]).values(payment_terms="ADVANCE", advance_amount=1_000_000))
    await ctx.db.commit()
    item = (await get_ok(ctx, auth, "/api/v1/orders"))["items"][0]
    assert_matches(item, {"status": "NEW", "paymentTerms": "ADVANCE", "amountDue": 1_000_000})

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


async def test_customer_cannot_cancel_preparing_403(ctx: Ctx, c, auth, pickup):
    await fill_cart(ctx, c, auth)
    o = await create_ok(ctx, auth, pickup)
    await ctx.db.execute(update(Order).where(Order.id == o["id"]).values(status="PREPARING"))
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
