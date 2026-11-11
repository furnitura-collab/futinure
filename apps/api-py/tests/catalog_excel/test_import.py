from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import Product, ProductVariant, StockMovement
from tests.catalog_excel.helpers import kromka, upload, xlsx
from tests.support import Ctx, assert_matches

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
