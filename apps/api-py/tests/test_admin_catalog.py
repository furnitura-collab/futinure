import asyncio
import base64
import re
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from app.models import AuditLog, PriceHistory, ProductVariant
from tests.support import Ctx, assert_matches, seed_catalog, user_with_token


@pytest.fixture
async def c(ctx: Ctx) -> SimpleNamespace:
    return await seed_catalog(ctx)


@pytest.fixture
async def manager(ctx: Ctx, c: SimpleNamespace) -> dict[str, str]:
    return (await user_with_token(ctx, "MANAGER")).auth


@pytest.fixture
async def admin(ctx: Ctx, c: SimpleNamespace) -> dict[str, str]:
    return (await user_with_token(ctx, "SUPER_ADMIN")).auth


def find(items: list[dict], key: str, value: str) -> dict:
    return next(i for i in items if i[key] == value)


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


# ───────────────────────── Ombor ─────────────────────────


async def test_stock_in_and_adjust_movement_history(ctx: Ctx, c: SimpleNamespace, manager, admin):
    res = await ctx.http.post(
        "/api/v1/admin/stock/movements",
        headers=manager,
        json={"type": "IN", "variantId": c.black.id, "qty": "14", "reason": "Yetkazib beruvchidan"},
    )
    assert res.status_code == 201
    adj = await ctx.http.post(
        "/api/v1/admin/stock/movements",
        headers=manager,
        json={"type": "ADJUST", "variantId": c.black.id, "actualQty": "18", "reason": "Sanoq"},
    )
    assert adj.status_code == 201
    assert adj.json()["variant"]["stockQty"] == "18"
    assert_matches(adj.json()["movement"], {"type": "ADJUST", "qty": "-2"})

    lst = await ctx.http.get(f"/api/v1/admin/stock/variants/{c.black.id}/movements", headers=manager)
    assert lst.status_code == 200
    assert [m["qty"] for m in lst.json()["items"]] == ["-2", "14"]


async def test_adjust_cannot_go_below_reserved(ctx: Ctx, c: SimpleNamespace, manager, admin):
    await ctx.db.execute(update(ProductVariant).where(ProductVariant.id == c.black.id).values(reserved_qty=Decimal(4)))
    await ctx.db.commit()
    res = await ctx.http.post(
        "/api/v1/admin/stock/movements",
        headers=manager,
        json={"type": "ADJUST", "variantId": c.black.id, "actualQty": "3", "reason": "Sanoq"},
    )
    assert res.status_code == 409
    assert_matches(res.json()["error"], {"code": "STOCK_BELOW_RESERVED", "details": {"reservedQty": "4"}})


async def test_parallel_stock_in_not_lost(ctx: Ctx, c: SimpleNamespace, manager, admin):
    results = await asyncio.gather(
        *(
            ctx.http.post(
                "/api/v1/admin/stock/movements", headers=manager, json={"type": "IN", "variantId": c.black.id, "qty": 1}
            )
            for _ in range(10)
        )
    )
    assert [r.status_code for r in results] == [201] * 10
    v = await ctx.get(ProductVariant, c.black.id)
    assert v.stock_qty == Decimal(16)


async def test_low_stock_list(ctx: Ctx, c: SimpleNamespace, manager, admin):
    res = await ctx.http.get("/api/v1/admin/stock/low", headers=manager)
    assert res.status_code == 200
    assert [r["sku"] for r in res.json()] == ["GTV-SL-500", "KR-0190-16"]


# ───────────────────────── Ommaviy narx ─────────────────────────


def bulk_body(c: SimpleNamespace, **extra) -> dict:
    return {"categoryId": c.plitalar.id, "percent": 5, "roundTo": 1000, **extra}


async def test_bulk_dry_run_changes_nothing(ctx: Ctx, c: SimpleNamespace, manager, admin):
    res = await ctx.http.post("/api/v1/admin/prices/bulk-update", headers=admin, json=bulk_body(c))
    assert res.status_code == 200
    assert res.json()["summary"]["variantCount"] == 2
    assert_matches(find(res.json()["preview"], "sku", "KR-W980-16"), {"oldPrice": 395_000, "newPrice": 415_000})
    v = await ctx.get(ProductVariant, c.white.id)
    assert v.base_price == 395_000


async def test_bulk_commit_base_tier_and_group_prices_together(ctx: Ctx, c: SimpleNamespace, manager, admin):
    res = await ctx.http.post("/api/v1/admin/prices/bulk-update", headers=admin, json=bulk_body(c, dryRun=False))
    assert res.status_code == 200
    v = await ctx.first(
        select(ProductVariant)
        .where(ProductVariant.id == c.white.id)
        .options(selectinload(ProductVariant.price_tiers), selectinload(ProductVariant.group_prices))
    )
    assert v.base_price == 415_000  # 414 750 → 415 000
    tiers = sorted(v.price_tiers, key=lambda t: t.min_qty)
    assert [t.price for t in tiers] == [404_000, 394_000]
    assert v.group_prices[0].price == 399_000
    # Boshqa kategoriya tegilmagan
    hinge = await ctx.get(ProductVariant, c.hinge_v.id)
    assert hinge.base_price == 14_000
    assert await ctx.count(PriceHistory, PriceHistory.source == "BULK") == 2


async def test_bulk_without_filter_rejected(ctx: Ctx, c: SimpleNamespace, manager, admin):
    res = await ctx.http.post("/api/v1/admin/prices/bulk-update", headers=admin, json={"percent": 5})
    assert res.status_code == 400


# ───────────────────────── Rasm yuklash ─────────────────────────

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")


async def test_png_uploaded_and_served_statically(ctx: Ctx, c: SimpleNamespace, manager, admin):
    res = await ctx.http.post("/api/v1/admin/uploads/images", headers=manager, files={"file": ("pixel.png", PNG)})
    assert res.status_code == 201
    url = res.json()["url"]
    assert re.match(r"^/uploads/catalog/\d{4}-\d{2}/[0-9a-f-]+\.png$", url)
    static = await ctx.http.get(url)
    assert static.status_code == 200
    assert re.search(r"image/png", static.headers["content-type"])

    res = await ctx.http.post(f"/api/v1/admin/products/{c.board.id}/images", headers=manager, json={"url": url})
    assert res.status_code == 201
    card = await ctx.http.get("/api/v1/products?q=kronospan")
    assert card.status_code == 200
    assert card.json()["items"][0]["imageUrl"] == url


async def test_non_image_rejected_even_with_png_extension(ctx: Ctx, c: SimpleNamespace, manager, admin):
    res = await ctx.http.post(
        "/api/v1/admin/uploads/images",
        headers=manager,
        files={"file": ("shell.png", b"<?php echo 1; ?> padding padding")},
    )
    assert res.status_code == 415
