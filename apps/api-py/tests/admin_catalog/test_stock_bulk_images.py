import asyncio
import base64
import re
from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from app.models import PriceHistory, ProductVariant
from tests.admin_catalog.helpers import find
from tests.support import Ctx, assert_matches

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
