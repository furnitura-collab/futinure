import re
from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import select, update

from app.models import PriceHistory, Product, ProductVariant, StockMovement, VariantPriceTier
from tests.catalog_excel.helpers import Row, kromka, upload, xlsx
from tests.support import Ctx, assert_matches


async def test_export_then_unchanged_import_is_noop(ctx: Ctx, c: SimpleNamespace, auth):
    exp = await ctx.http.get("/api/v1/admin/catalog/export.xlsx", headers=auth)
    assert exp.status_code == 200
    assert re.search(r"spreadsheetml", exp.headers["content-type"])

    res = await upload(ctx, auth, exp.content)
    assert res.status_code == 200
    assert res.json()["errors"] == []
    assert res.json()["summary"] == {
        "productsCreated": 0,
        "productsUpdated": 0,
        "variantsCreated": 0,
        "variantsUpdated": 0,
        "priceChanges": 0,
        "stockChanges": 0,
        "brandsCreated": [],
    }


async def test_update_existing_sku_price_and_stock(ctx: Ctx, c: SimpleNamespace, auth):
    row: Row = {
        "product_code": "LDSP-16",
        "category_slug": "ldsp",
        "brand": "Kronospan",
        "name_uz": "LDSP Kronospan 16 mm",
        "name_ru": "ЛДСП Kronospan 16 мм",
        "unit": "SHEET",
        "kind": "BOARD",
        "weight_kg": 45,
        "volume_m3": 0.092,
        "board_length_mm": 2800,
        "board_width_mm": 2070,
        "thickness_mm": 16,
        "sku": "KR-0190-16",
        "price": 430_000,
        "stock": 10,
        "attr:color": "Qora",
        "attr:decor_code": "0190",
    }
    dry = await upload(ctx, auth, xlsx([row]))
    assert dry.status_code == 200
    assert_matches(dry.json()["summary"], {"productsUpdated": 0, "variantsUpdated": 1, "priceChanges": 1, "stockChanges": 1})

    assert (await upload(ctx, auth, xlsx([row]), True)).status_code == 200
    v = await ctx.get(ProductVariant, c.black.id)
    assert v.base_price == 430_000
    assert v.stock_qty == Decimal(10)
    assert await ctx.count(PriceHistory, PriceHistory.variant_id == c.black.id, PriceHistory.source == "IMPORT") == 1
    mv = await ctx.first(select(StockMovement).where(StockMovement.variant_id == c.black.id))
    assert mv is not None
    assert mv.type == "ADJUST"
    assert mv.qty == Decimal(4)
    # Faylda tier va group ustunlari yo'q — mavjudlariga tegilmagan (boshqa variantda)
    assert await ctx.count(VariantPriceTier, VariantPriceTier.variant_id == c.white.id) == 2


async def test_stock_below_reserved_error(ctx: Ctx, c: SimpleNamespace, auth):
    await ctx.db.execute(update(ProductVariant).where(ProductVariant.id == c.hinge_v.id).values(reserved_qty=Decimal(100)))
    await ctx.db.commit()
    res = await upload(
        ctx,
        auth,
        xlsx(
            [
                {
                    "product_code": "PETLYA",
                    "category_slug": "furnitura",
                    "name_uz": "Petlya dovodchikli",
                    "name_ru": "Петля с доводчиком",
                    "unit": "PIECE",
                    "min_qty": 2,
                    "qty_step": 2,
                    "weight_kg": 0.1,
                    "sku": "GTV-PB-110",
                    "price": 14_000,
                    "stock": 50,
                }
            ]
        ),
    )
    assert res.status_code == 200
    errors = res.json()["errors"]
    assert len(errors) == 1
    assert_matches(errors[0], {"column": "stock"})


async def test_codeless_product_found_by_sku_and_gets_code(ctx: Ctx, c: SimpleNamespace, auth):
    await ctx.db.execute(update(Product).where(Product.id == c.hinge.id).values(code=None))
    await ctx.db.commit()
    res = await upload(
        ctx,
        auth,
        xlsx(
            [
                {
                    "product_code": "PETLYA-NEW",
                    "category_slug": "furnitura",
                    "name_uz": "Petlya dovodchikli",
                    "name_ru": "Петля с доводчиком",
                    "unit": "PIECE",
                    "min_qty": 2,
                    "qty_step": 2,
                    "weight_kg": 0.1,
                    "sku": "GTV-PB-110",
                    "price": 14_000,
                }
            ]
        ),
        True,
    )
    assert res.status_code == 200
    assert_matches(res.json()["summary"], {"productsCreated": 0, "productsUpdated": 1})
    p = await ctx.get(Product, c.hinge.id)
    assert p.code == "PETLYA-NEW"


async def test_sku_belongs_to_product_with_other_code_error(ctx: Ctx, c: SimpleNamespace, auth):
    res = await upload(ctx, auth, xlsx([kromka(sku="GTV-PB-110")]))
    assert res.status_code == 200
    err = res.json()["errors"][0]
    assert_matches(err, {"column": "sku"})
    assert "PETLYA" in err["message"]
