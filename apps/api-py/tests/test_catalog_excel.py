import io
import re
from decimal import Decimal
from types import SimpleNamespace

import pytest
from openpyxl import Workbook
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from app.models import PriceHistory, Product, ProductVariant, StockMovement, VariantPriceTier
from tests.support import Ctx, assert_matches, seed_catalog, user_with_token

Row = dict[str, str | int | float]
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def xlsx(rows: list[Row], columns: list[str] | None = None) -> bytes:
    cols = columns or list(dict.fromkeys(k for r in rows for k in r))
    wb = Workbook()
    ws = wb.active
    ws.title = "Mahsulotlar"
    ws.append(cols)
    for r in rows:
        ws.append([r.get(c) for c in cols])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def kromka(**over: str | int | float) -> Row:
    return {
        "product_code": "KROMKA-2",
        "category_slug": "furnitura",
        "brand": "Rehau",
        "name_uz": "PVX kromka 2 mm",
        "name_ru": "Кромка ПВХ 2 мм",
        "unit": "meter",
        "kind": "EDGE",
        "qty_step": "0,5",
        "sku": "RH-2-W980",
        "price": "4 500",
        "stock": 3000,
        "attr:color": "Oq",
        "attr:width": 22,
        "group:Usta": 4300,
        "tier1_qty": 100,
        "tier1_price": 4200,
        **over,
    }


@pytest.fixture
async def c(ctx: Ctx) -> SimpleNamespace:
    return await seed_catalog(ctx)


@pytest.fixture
async def auth(ctx: Ctx, c: SimpleNamespace) -> dict[str, str]:
    return (await user_with_token(ctx, "MANAGER")).auth


async def upload(ctx: Ctx, auth: dict[str, str], buf: bytes, commit: bool = False):
    return await ctx.http.post(
        f"/api/v1/admin/catalog/import?commit={'true' if commit else 'false'}",
        headers=auth,
        files={"file": ("katalog.xlsx", buf, XLSX_MIME)},
    )


# ───────────────────────── Katalog — Excel ─────────────────────────


async def test_dry_run_shows_result_saves_nothing(ctx: Ctx, c: SimpleNamespace, auth):
    buf = xlsx([kromka(), kromka(**{"sku": "RH-2-K001", "attr:color": "Yong'oq", "group:Usta": ""})])
    res = await upload(ctx, auth, buf)
    assert res.status_code == 200
    assert_matches(
        res.json(),
        {
            "committed": False,
            "rows": 2,
            "errors": [],
            "summary": {"productsCreated": 1, "variantsCreated": 2, "stockChanges": 2, "brandsCreated": ["Rehau"]},
        },
    )
    assert await ctx.count(Product, Product.code == "KROMKA-2") == 0


async def test_commit_product_variants_prices_and_initial_stock(ctx: Ctx, c: SimpleNamespace, auth):
    buf = xlsx([kromka(), kromka(**{"sku": "RH-2-K001", "attr:color": "Yong'oq", "group:Usta": ""})])
    res = await upload(ctx, auth, buf, True)
    assert res.status_code == 200
    assert res.json()["committed"] is True

    product = await ctx.first(
        select(Product)
        .where(Product.code == "KROMKA-2")
        .options(
            selectinload(Product.brand),
            selectinload(Product.variants).selectinload(ProductVariant.price_tiers),
            selectinload(Product.variants).selectinload(ProductVariant.group_prices),
        )
    )
    assert product is not None
    assert product.unit == "METER"
    assert product.kind == "EDGE"
    assert product.brand is not None and product.brand.name == "Rehau"
    assert product.qty_step == Decimal("0.5")
    k001, w980 = sorted(product.variants, key=lambda v: v.sku)
    assert w980.sku == "RH-2-W980"
    assert w980.base_price == 4500
    assert_matches(w980.attributes, {"color": "Oq", "width": 22})
    assert w980.stock_qty == Decimal(3000)
    assert [(t.min_qty, t.price) for t in w980.price_tiers] == [(Decimal(100), 4200)]
    assert [g.price for g in w980.group_prices] == [4300]
    assert k001.group_prices == []
    assert await ctx.count(StockMovement, StockMovement.type == "IN") == 2


async def test_errors_with_row_numbers_nothing_saved(ctx: Ctx, c: SimpleNamespace, auth):
    buf = xlsx(
        [
            kromka(),
            kromka(sku="RH-2-W980"),  # takroriy SKU
            kromka(product_code="X", sku="X-1", category_slug="yoq-kategoriya"),
            kromka(product_code="Y", sku="Y-1", unit="litr", price="qimmat"),
            kromka(product_code="KROMKA-2", sku="Z-1", name_uz="Boshqa nom"),  # mahsulot maydonlari farq qiladi
            kromka(product_code="B", sku="B-1", kind="BOARD"),  # o'lchamsiz plita
            kromka(**{"product_code": "G", "sku": "G-1", "group:Diler": 1}),  # bunday guruh yo'q
        ]
    )
    res = await upload(ctx, auth, buf, True)
    assert res.status_code == 200
    assert res.json()["committed"] is False
    errs = [f"{e['row']}:{e['column']}" for e in res.json()["errors"]]
    for expected in ["3:sku", "5:unit", "5:price", "6:product_code", "7:board_length_mm"]:
        assert expected in errs, errs
    assert await ctx.count(Product, Product.code == "KROMKA-2") == 0


async def test_category_and_group_not_found_error(ctx: Ctx, c: SimpleNamespace, auth):
    buf = xlsx([kromka(category_slug="yoq"), kromka(**{"product_code": "G", "sku": "G-1", "group:Diler": 1})])
    res = await upload(ctx, auth, buf)
    assert res.status_code == 200
    assert sorted(e["column"] for e in res.json()["errors"]) == ["category_slug", "group:Diler"]


async def test_required_columns_missing(ctx: Ctx, c: SimpleNamespace, auth):
    res = await upload(ctx, auth, xlsx([{"product_code": "A", "sku": "A"}]))
    assert res.status_code == 200
    columns = [e["column"] for e in res.json()["errors"]]
    for expected in ["category_slug", "name_uz", "name_ru", "unit", "price"]:
        assert expected in columns, columns


async def test_non_xlsx_file_422(ctx: Ctx, c: SimpleNamespace, auth):
    res = await upload(ctx, auth, b"a,b,c\n1,2,3")
    assert res.status_code == 422


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
