from types import SimpleNamespace

from app.models import AuditLog, ProductVariant
from tests.admin_catalog.helpers import find
from tests.support import Ctx, assert_matches, user_with_token

# ───────────────────────── Ruxsatlar ─────────────────────────


async def test_customer_and_anonymous_cannot_access_admin(ctx: Ctx, c: SimpleNamespace, manager, admin):
    customer = (await user_with_token(ctx, "CUSTOMER")).auth
    assert (await ctx.http.get("/api/v1/admin/products")).status_code == 401
    assert (await ctx.http.get("/api/v1/admin/products", headers=customer)).status_code == 403
    assert (await ctx.http.post("/api/v1/admin/stock/movements", headers=customer, json={})).status_code == 403


async def test_warehouse_can_add_stock_but_not_edit_products(ctx: Ctx, c: SimpleNamespace, manager, admin):
    wh = (await user_with_token(ctx, "WAREHOUSE")).auth
    res = await ctx.http.post(
        "/api/v1/admin/stock/movements", headers=wh, json={"type": "IN", "variantId": c.black.id, "qty": 10}
    )
    assert res.status_code == 201
    res = await ctx.http.patch(f"/api/v1/admin/products/{c.board.id}", headers=wh, json={"nameUz": "x"})
    assert res.status_code == 403
    # Kirim uchun tovar qidira oladi
    assert (await ctx.http.get("/api/v1/admin/products?q=kronospan", headers=wh)).status_code == 200
    assert (await ctx.http.get(f"/api/v1/admin/products/{c.board.id}", headers=wh)).status_code == 200
    assert (await ctx.http.get("/api/v1/admin/categories", headers=wh)).status_code == 403


async def test_bulk_price_and_delete_super_admin_only(ctx: Ctx, c: SimpleNamespace, manager, admin):
    res = await ctx.http.post("/api/v1/admin/prices/bulk-update", headers=manager, json={"categoryId": c.ldsp.id, "percent": 5})
    assert res.status_code == 403
    assert (await ctx.http.delete(f"/api/v1/admin/products/{c.hinge.id}", headers=manager)).status_code == 403


# ───────────────────────── Kategoriya, mahsulot, variant ─────────────────────────


async def test_full_create_flow(ctx: Ctx, c: SimpleNamespace, manager, admin):
    cat = await ctx.http.post(
        "/api/v1/admin/categories", headers=manager, json={"nameUz": "Kromka", "nameRu": "Кромка", "slug": "kromka"}
    )
    assert cat.status_code == 201

    product = await ctx.http.post(
        "/api/v1/admin/products",
        headers=manager,
        json={
            "categoryId": cat.json()["id"],
            "nameUz": "PVX kromka 2mm",
            "nameRu": "Кромка ПВХ 2мм",
            "unit": "METER",
            "kind": "EDGE",
            "qtyStep": "0.5",
        },
    )
    assert product.status_code == 201
    assert_matches(product.json(), {"qtyStep": "0.5", "minQty": "1", "variants": []})

    variant = await ctx.http.post(
        f"/api/v1/admin/products/{product.json()['id']}/variants",
        headers=manager,
        json={"sku": "RH-2-W980", "basePrice": 4500, "attributes": {"color": "Oq", "width": 22}},
    )
    assert variant.status_code == 201
    assert_matches(variant.json(), {"stockQty": "0", "availableQty": "0", "stockLevel": "OUT_OF_STOCK", "onOrder": False})

    audit = await ctx.count(AuditLog, AuditLog.entity.in_(["category", "product", "variant"]))
    assert audit == 3


async def test_board_without_dimensions_422(ctx: Ctx, c: SimpleNamespace, manager, admin):
    res = await ctx.http.post(
        "/api/v1/admin/products",
        headers=manager,
        json={"categoryId": c.ldsp.id, "nameUz": "x", "nameRu": "x", "unit": "SHEET", "kind": "BOARD"},
    )
    assert res.status_code == 422
    assert res.json()["error"]["details"][0]["message"] == "BOARD_DIMENSIONS_REQUIRED"

    # Mavjud mahsulotni BOARD'ga o'tkazishda ham
    res = await ctx.http.patch(f"/api/v1/admin/products/{c.hinge.id}", headers=manager, json={"kind": "BOARD"})
    assert res.status_code == 422


async def test_patch_keeps_unsent_fields(ctx: Ctx, c: SimpleNamespace, manager, admin):
    """PATCH faqat yuborilgan maydonni o'zgartiradi — kind, isActive, lowStockThreshold joyida qoladi"""
    res = await ctx.http.patch(f"/api/v1/admin/products/{c.board.id}", headers=manager, json={"nameUz": "Yangi nom"})
    assert res.status_code == 200
    assert_matches(res.json(), {"nameUz": "Yangi nom", "kind": "BOARD"})
    res = await ctx.http.patch(f"/api/v1/admin/variants/{c.white.id}", headers=manager, json={"basePrice": 400_000})
    assert res.status_code == 200
    assert res.json()["lowStockThreshold"] == "10"


async def test_duplicate_sku_409(ctx: Ctx, c: SimpleNamespace, manager, admin):
    res = await ctx.http.post(
        f"/api/v1/admin/products/{c.board.id}/variants", headers=manager, json={"sku": "KR-W980-16", "basePrice": 1}
    )
    assert res.status_code == 409


async def test_category_cannot_move_into_own_descendant(ctx: Ctx, c: SimpleNamespace, manager, admin):
    res = await ctx.http.patch(f"/api/v1/admin/categories/{c.plitalar.id}", headers=manager, json={"parentId": c.ldsp.id})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "CATEGORY_CYCLE"


async def test_non_empty_category_not_deleted(ctx: Ctx, c: SimpleNamespace, manager, admin):
    res = await ctx.http.delete(f"/api/v1/admin/categories/{c.ldsp.id}", headers=manager)
    assert res.status_code == 409
    assert res.json()["error"]["details"] == {"products": 1, "children": 0}


async def test_price_change_written_to_history(ctx: Ctx, c: SimpleNamespace, manager, admin):
    for _ in range(2):
        res = await ctx.http.patch(f"/api/v1/admin/variants/{c.white.id}", headers=manager, json={"basePrice": 410_000})
        assert res.status_code == 200
    history = await ctx.http.get(f"/api/v1/admin/variants/{c.white.id}/price-history", headers=manager)
    assert history.status_code == 200
    assert len(history.json()) == 1
    assert_matches(history.json()[0], {"oldPrice": 395_000, "newPrice": 410_000, "source": "MANUAL"})


async def test_replace_tier_and_group_prices(ctx: Ctx, c: SimpleNamespace, manager, admin):
    tiers = await ctx.http.put(
        f"/api/v1/admin/variants/{c.white.id}/price-tiers", headers=manager, json=[{"minQty": "20", "price": 380_000}]
    )
    assert tiers.status_code == 200
    assert tiers.json()["priceTiers"] == [{"minQty": "20", "price": 380_000}]

    res = await ctx.http.put(
        f"/api/v1/admin/variants/{c.white.id}/price-tiers",
        headers=manager,
        json=[{"minQty": "20", "price": 1}, {"minQty": "20.0", "price": 2}],
    )
    assert res.status_code == 422

    groups = await ctx.http.put(f"/api/v1/admin/variants/{c.white.id}/group-prices", headers=manager, json=[])
    assert groups.status_code == 200
    assert groups.json()["groupPrices"] == []


async def test_unused_product_deleted(ctx: Ctx, c: SimpleNamespace, manager, admin):
    res = await ctx.http.delete(f"/api/v1/admin/products/{c.hinge.id}", headers=admin)
    assert res.status_code == 204
    assert await ctx.count(ProductVariant, ProductVariant.id == c.hinge_v.id) == 0


async def test_admin_list_exact_stock_and_low_stock_filter(ctx: Ctx, c: SimpleNamespace, manager, admin):
    res = await ctx.http.get("/api/v1/admin/products?lowStock=true", headers=manager)
    assert res.status_code == 200
    assert sorted(p["id"] for p in res.json()["items"]) == sorted([c.board.id, c.slide.id])
    board = find(res.json()["items"], "id", c.board.id)
    black = find(board["variants"], "sku", "KR-0190-16")
    assert_matches(black, {"stockQty": "6", "reservedQty": "0", "availableQty": "6", "stockLevel": "LOW"})
