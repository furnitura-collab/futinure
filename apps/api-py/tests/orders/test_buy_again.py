from sqlalchemy import update

from app.models import (
    ProductVariant,
    VariantGroupPrice,
)
from tests.orders.helpers import cancel, create_ok, fill_cart, get_ok, put_cart
from tests.support import Ctx, assert_matches, user_with_token

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
