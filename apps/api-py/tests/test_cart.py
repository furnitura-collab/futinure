from types import SimpleNamespace

import pytest
from sqlalchemy import update

from app.models import CartItem, Product, ProductImage, ProductVariant
from tests.support import Ctx, assert_matches, seed_catalog, user_with_token


@pytest.fixture
async def c(ctx: Ctx) -> SimpleNamespace:
    return await seed_catalog(ctx)


@pytest.fixture
async def auth(ctx: Ctx, c: SimpleNamespace) -> dict[str, str]:
    return (await user_with_token(ctx, "CUSTOMER", price_group_id=c.usta.id)).auth


async def put(ctx: Ctx, auth: dict[str, str], variant_id: str, qty: str | int):
    return await ctx.http.put(f"/api/v1/cart/items/{variant_id}", headers=auth, json={"qty": qty})


async def put_ok(ctx: Ctx, auth: dict[str, str], variant_id: str, qty: str | int):
    res = await put(ctx, auth, variant_id, qty)
    assert res.status_code == 200, res.text
    return res


# ───────────────────────── Savat ─────────────────────────


async def test_staff_cannot_use_cart(ctx: Ctx, auth: dict[str, str]):
    m = (await user_with_token(ctx, "MANAGER")).auth
    assert (await ctx.http.get("/api/v1/cart", headers=m)).status_code == 403


async def test_add_personal_price_total(ctx: Ctx, c: SimpleNamespace, auth: dict[str, str]):
    await put_ok(ctx, auth, c.white.id, 12)
    res = await put_ok(ctx, auth, c.hinge_v.id, 4)
    body = res.json()
    assert body["count"] == 2
    assert [line["unitPrice"] for line in body["lines"]] == [380_000, 14_000]
    assert body["itemsTotal"] == 12 * 380_000 + 4 * 14_000
    assert body["hasBlockingIssues"] is False


async def test_line_has_category_kind_and_image(ctx: Ctx, c: SimpleNamespace, auth: dict[str, str]):
    await ctx.add(ProductImage(product_id=c.board.id, url="/uploads/catalog/ldsp.webp"))
    await put_ok(ctx, auth, c.white.id, 2)
    res = await put_ok(ctx, auth, c.hinge_v.id, 2)
    lines = res.json()["lines"]
    assert_matches(lines[0], {"categoryId": c.ldsp.id, "kind": "BOARD", "imageUrl": "/uploads/catalog/ldsp.webp"})
    assert_matches(lines[1], {"categoryId": c.furnitura.id, "kind": "GOODS", "imageUrl": None})


async def test_put_replaces_qty_not_adds(ctx: Ctx, c: SimpleNamespace, auth: dict[str, str]):
    await put_ok(ctx, auth, c.white.id, 12)
    res = await put_ok(ctx, auth, c.white.id, 3)
    assert res.json()["lines"][0]["qty"] == "3"


async def test_invalid_qty_not_saved(ctx: Ctx, c: SimpleNamespace, auth: dict[str, str]):
    res = await put(ctx, auth, c.hinge_v.id, 3)
    assert res.status_code == 422
    assert_matches(res.json()["error"], {"code": "INVALID_QTY", "details": {"code": "NOT_MULTIPLE_OF_STEP", "qtyStep": "2"}})
    assert await ctx.count(CartItem) == 0


async def test_out_of_stock_inactive_and_missing(ctx: Ctx, c: SimpleNamespace, auth: dict[str, str]):
    await ctx.db.execute(update(ProductVariant).where(ProductVariant.id == c.black.id).values(stock_qty=0))
    await ctx.db.commit()
    res = await put(ctx, auth, c.black.id, 1)
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "OUT_OF_STOCK"
    await ctx.db.execute(update(ProductVariant).where(ProductVariant.id == c.white.id).values(is_active=False))
    await ctx.db.commit()
    res = await put(ctx, auth, c.white.id, 1)
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "INACTIVE"
    assert (await put(ctx, auth, "01900000-0000-7000-8000-000000000000", 1)).status_code == 404


async def test_exceeds_stock_added_with_warning(ctx: Ctx, c: SimpleNamespace, auth: dict[str, str]):
    res = await put_ok(ctx, auth, c.black.id, 10)
    body = res.json()
    assert body["lines"][0]["issues"] == [{"code": "EXCEEDS_AVAILABLE", "available": "6"}]
    assert body["hasIssues"] is True
    assert body["hasBlockingIssues"] is False


async def test_product_deactivated_later_is_blocking(ctx: Ctx, c: SimpleNamespace, auth: dict[str, str]):
    await put_ok(ctx, auth, c.white.id, 1)
    await ctx.db.execute(update(Product).where(Product.id == c.board.id).values(is_active=False))
    await ctx.db.commit()
    res = await ctx.http.get("/api/v1/cart", headers=auth)
    assert res.status_code == 200
    assert res.json()["hasBlockingIssues"] is True


async def test_remove_and_clear(ctx: Ctx, c: SimpleNamespace, auth: dict[str, str]):
    await put_ok(ctx, auth, c.white.id, 1)
    await put_ok(ctx, auth, c.hinge_v.id, 2)
    res = await ctx.http.delete(f"/api/v1/cart/items/{c.white.id}", headers=auth)
    assert res.status_code == 200
    assert res.json()["count"] == 1
    assert (await ctx.http.delete("/api/v1/cart", headers=auth)).status_code == 204
    assert (await ctx.http.get("/api/v1/cart", headers=auth)).json()["count"] == 0


async def test_bulk_add_by_sku(ctx: Ctx, c: SimpleNamespace, auth: dict[str, str]):
    await put_ok(ctx, auth, c.hinge_v.id, 2)
    res = await ctx.http.post(
        "/api/v1/cart/items/bulk",
        headers=auth,
        json={
            "items": [
                {"sku": "gtv-pb-110", "qty": 4},
                {"sku": "KR-W980-16", "qty": 5},
                {"sku": "YOQ-SKU", "qty": 1},
                {"sku": "GTV-PB-110", "qty": 1},
            ]
        },
    )
    assert res.status_code == 200
    assert [r["status"] for r in res.json()["results"]] == ["ADDED", "ADDED", "NOT_FOUND", "NOT_MULTIPLE_OF_STEP"]
    hinge = next(line for line in res.json()["cart"]["lines"] if line["sku"] == "GTV-PB-110")
    assert hinge["qty"] == "6"


# ───────────────────────── Sevimlilar ─────────────────────────


async def test_favorites_add_list_remove(ctx: Ctx, c: SimpleNamespace, auth: dict[str, str]):
    assert (await ctx.http.put(f"/api/v1/favorites/{c.board.id}", headers=auth)).status_code == 204
    assert (await ctx.http.put(f"/api/v1/favorites/{c.board.id}", headers=auth)).status_code == 204
    res = await ctx.http.get("/api/v1/favorites", headers=auth)
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert_matches(res.json()[0], {"id": c.board.id, "priceFrom": 380_000})
    assert (await ctx.http.delete(f"/api/v1/favorites/{c.board.id}", headers=auth)).status_code == 204
    assert (await ctx.http.get("/api/v1/favorites", headers=auth)).json() == []


async def test_favorites_inactive_product_rejected(ctx: Ctx, c: SimpleNamespace, auth: dict[str, str]):
    await ctx.db.execute(update(Product).where(Product.id == c.hinge.id).values(is_active=False))
    await ctx.db.commit()
    assert (await ctx.http.put(f"/api/v1/favorites/{c.hinge.id}", headers=auth)).status_code == 404


# ───────────────────────── Manzillar ─────────────────────────

ADDRESS = {"label": "Sex", "addressText": "Toshkent, Chilonzor 5", "lat": 41.28, "lng": 69.2}


async def test_address_create_and_update(ctx: Ctx, auth: dict[str, str]):
    res = await ctx.http.post("/api/v1/addresses", headers=auth, json=ADDRESS)
    assert res.status_code == 201
    assert_matches(res.json(), {**ADDRESS, "floor": None, "needsLoaders": False})
    upd = await ctx.http.patch(f"/api/v1/addresses/{res.json()['id']}", headers=auth, json={"floor": 3})
    assert upd.status_code == 200
    assert upd.json()["floor"] == 3


async def test_address_outside_uzbekistan_422(ctx: Ctx, auth: dict[str, str]):
    res = await ctx.http.post("/api/v1/addresses", headers=auth, json={**ADDRESS, "lat": 55.75, "lng": 37.61})
    assert res.status_code == 422


async def test_foreign_address_invisible_and_immutable(ctx: Ctx, auth: dict[str, str]):
    res = await ctx.http.post("/api/v1/addresses", headers=auth, json=ADDRESS)
    assert res.status_code == 201
    address_id = res.json()["id"]
    other = (await user_with_token(ctx, "CUSTOMER")).auth
    assert (await ctx.http.get("/api/v1/addresses", headers=other)).json() == []
    assert (await ctx.http.patch(f"/api/v1/addresses/{address_id}", headers=other, json={"floor": 1})).status_code == 404
    assert (await ctx.http.delete(f"/api/v1/addresses/{address_id}", headers=other)).status_code == 404
