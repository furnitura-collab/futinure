from decimal import Decimal
from types import SimpleNamespace
from urllib.parse import quote as urlquote

import pytest
from sqlalchemy import update

from app.models import Product, ProductVariant
from tests.support import Ctx, assert_matches, seed_catalog, user_with_token


@pytest.fixture
async def c(ctx: Ctx) -> SimpleNamespace:
    return await seed_catalog(ctx)


def find(items: list[dict], key: str, value: str) -> dict:
    return next(i for i in items if i[key] == value)


# ───────────────────────── Kategoriyalar ─────────────────────────


async def test_category_tree_hides_inactive(ctx: Ctx, c: SimpleNamespace):
    res = await ctx.http.get("/api/v1/categories")
    assert res.status_code == 200
    slugs = [n["slug"] for n in res.json()]
    assert "plitalar" in slugs
    assert "arxiv" not in slugs
    plitalar = find(res.json(), "slug", "plitalar")
    assert [n["slug"] for n in plitalar["children"]] == ["ldsp"]


async def test_category_product_count_includes_children_excludes_inactive(ctx: Ctx, c: SimpleNamespace):
    await ctx.db.execute(update(Product).where(Product.id == c.slide.id).values(is_active=False))
    await ctx.db.commit()
    res = await ctx.http.get("/api/v1/categories")
    assert res.status_code == 200
    plitalar = find(res.json(), "slug", "plitalar")
    assert_matches(plitalar, {"productCount": 1})
    assert len(plitalar["children"]) == 1
    assert_matches(plitalar["children"][0], {"slug": "ldsp", "productCount": 1})
    assert find(res.json(), "slug", "furnitura")["productCount"] == 1


# ───────────────────────── Ro'yxat ─────────────────────────


async def test_guest_sees_retail_price_no_inactive_category_products(ctx: Ctx, c: SimpleNamespace):
    res = await ctx.http.get("/api/v1/products")
    assert res.status_code == 200
    assert res.json()["total"] == 3
    board = find(res.json()["items"], "id", c.board.id)
    assert_matches(board, {"priceFrom": 395_000, "basePriceFrom": 395_000, "stockLevel": "IN_STOCK", "variantCount": 2})


async def test_card_quick_add_single_variant_id_and_qty_rules(ctx: Ctx, c: SimpleNamespace):
    res = await ctx.http.get("/api/v1/products")
    assert res.status_code == 200
    items = res.json()["items"]
    assert_matches(find(items, "id", c.board.id), {"variantId": None, "minQty": "1", "qtyStep": "1"})
    assert_matches(find(items, "id", c.hinge.id), {"variantId": c.hinge_v.id, "minQty": "2", "qtyStep": "2"})


async def test_master_group_customer_sees_personal_price(ctx: Ctx, c: SimpleNamespace):
    customer = await user_with_token(ctx, "CUSTOMER", price_group_id=c.usta.id)
    res = await ctx.http.get("/api/v1/products", headers=customer.auth)
    assert res.status_code == 200
    board = find(res.json()["items"], "id", c.board.id)
    assert board["priceFrom"] == 380_000
    assert board["basePriceFrom"] == 395_000


async def test_price_from_ignores_out_of_stock_variant(ctx: Ctx, c: SimpleNamespace):
    # Arzonroq, lekin tugagan variant
    await ctx.add(ProductVariant(product_id=c.board.id, sku="KR-CHEAP", base_price=100_000, stock_qty=Decimal(0)))
    res = await ctx.http.get("/api/v1/products")
    assert res.status_code == 200
    board = find(res.json()["items"], "id", c.board.id)
    assert board["priceFrom"] == 395_000


async def test_parent_category_filter_includes_children(ctx: Ctx, c: SimpleNamespace):
    res = await ctx.http.get(f"/api/v1/products?categoryId={c.plitalar.id}")
    assert res.status_code == 200
    assert [p["id"] for p in res.json()["items"]] == [c.board.id]


@pytest.mark.parametrize(
    "q",
    [
        pytest.param("kronospan", id="by_name"),
        pytest.param("петля", id="russian_name"),
        pytest.param("w980", id="by_sku"),
        pytest.param("kronspan", id="typo"),
    ],
)
async def test_search(ctx: Ctx, c: SimpleNamespace, q: str):
    res = await ctx.http.get(f"/api/v1/products?q={urlquote(q)}")
    assert res.status_code == 200
    assert res.json()["total"] == 1


async def test_search_percent_is_not_wildcard(ctx: Ctx, c: SimpleNamespace):
    res = await ctx.http.get("/api/v1/products?q=%25")
    assert res.status_code == 200
    assert res.json()["total"] == 0


async def test_in_stock_only(ctx: Ctx, c: SimpleNamespace):
    res = await ctx.http.get("/api/v1/products?inStock=true")
    assert res.status_code == 200
    assert sorted(p["id"] for p in res.json()["items"]) == sorted([c.board.id, c.hinge.id])


async def test_sort_by_price_and_pagination(ctx: Ctx, c: SimpleNamespace):
    page1 = await ctx.http.get("/api/v1/products?sort=price_asc&limit=2")
    assert page1.status_code == 200
    assert [p["priceFrom"] for p in page1.json()["items"]] == [14_000, 49_000]
    page2 = await ctx.http.get("/api/v1/products?sort=price_asc&limit=2&page=2")
    assert page2.status_code == 200
    assert [p["priceFrom"] for p in page2.json()["items"]] == [395_000]
    assert page2.json()["total"] == 3


# ───────────────────────── Mahsulot sahifasi ─────────────────────────


async def test_product_page_stock_level_shown_exact_qty_hidden(ctx: Ctx, c: SimpleNamespace):
    res = await ctx.http.get(f"/api/v1/products/{c.board.id}")
    assert res.status_code == 200
    white = find(res.json()["variants"], "sku", "KR-W980-16")
    black = find(res.json()["variants"], "sku", "KR-0190-16")
    assert white["stockLevel"] == "IN_STOCK"
    assert black["stockLevel"] == "LOW"
    assert "stockQty" not in white
    assert white["tiers"] == [
        {"minQty": "10", "price": 385_000},
        {"minQty": "50", "price": 375_000},
    ]
    assert res.json()["board"] == {"lengthMm": 2800, "widthMm": 2070, "thicknessMm": "16"}
    assert res.json()["weightKg"] == "45"


async def test_master_does_not_see_tiers_pricier_than_personal_price(ctx: Ctx, c: SimpleNamespace):
    customer = await user_with_token(ctx, "CUSTOMER", price_group_id=c.usta.id)
    res = await ctx.http.get(f"/api/v1/products/{c.board.id}", headers=customer.auth)
    assert res.status_code == 200
    white = find(res.json()["variants"], "sku", "KR-W980-16")
    assert white["price"] == 380_000
    assert white["tiers"] == [{"minQty": "50", "price": 375_000}]


async def test_on_order_product_with_lead_time(ctx: Ctx, c: SimpleNamespace):
    res = await ctx.http.get(f"/api/v1/products/{c.slide.id}")
    assert res.status_code == 200
    assert_matches(res.json()["variants"][0], {"stockLevel": "ON_ORDER", "leadTimeDays": 7})


async def test_product_in_inactive_category_404(ctx: Ctx, c: SimpleNamespace):
    res = await ctx.http.get(f"/api/v1/products/{c.old.id}")
    assert res.status_code == 404


async def test_by_sku_case_insensitive(ctx: Ctx, c: SimpleNamespace):
    res = await ctx.http.get("/api/v1/variants/by-sku/kr-w980-16")
    assert res.status_code == 200
    assert res.json()["variantId"] == c.white.id


async def test_public_page_opens_with_broken_token(ctx: Ctx, c: SimpleNamespace):
    res = await ctx.http.get("/api/v1/products", headers={"Authorization": "Bearer buzilgan"})
    assert res.status_code == 200


# ───────────────────────── Narx hisoblash (/pricing/quote) ─────────────────────────


async def quote(ctx: Ctx, items: list[dict], auth: dict[str, str] | None = None):
    return await ctx.http.post("/api/v1/pricing/quote", headers=auth or {}, json={"items": items})


async def test_quote_tier_price_and_total(ctx: Ctx, c: SimpleNamespace):
    res = await quote(ctx, [{"variantId": c.white.id, "qty": 10}, {"variantId": c.hinge_v.id, "qty": 4}])
    assert res.status_code == 200
    assert [line["unitPrice"] for line in res.json()["lines"]] == [385_000, 14_000]
    assert res.json()["itemsTotal"] == 3_850_000 + 56_000
    assert res.json()["hasIssues"] is False
    assert res.json()["totalWeightKg"] == 450.4


async def test_quote_group_price_cheaper_than_tier(ctx: Ctx, c: SimpleNamespace):
    customer = await user_with_token(ctx, "CUSTOMER", price_group_id=c.usta.id)
    res = await quote(ctx, [{"variantId": c.white.id, "qty": 10}], customer.auth)
    assert res.status_code == 200
    assert_matches(res.json()["lines"][0], {"unitPrice": 380_000, "priceReason": "GROUP"})


async def test_quote_qty_step_violated(ctx: Ctx, c: SimpleNamespace):
    res = await quote(ctx, [{"variantId": c.hinge_v.id, "qty": 3}])
    assert res.status_code == 200
    assert res.json()["lines"][0]["issues"] == [{"code": "NOT_MULTIPLE_OF_STEP", "minQty": "2", "qtyStep": "2"}]


async def test_quote_exceeds_stock_reports_available(ctx: Ctx, c: SimpleNamespace):
    res = await quote(ctx, [{"variantId": c.black.id, "qty": 8}])
    assert res.status_code == 200
    assert res.json()["lines"][0]["issues"] == [{"code": "EXCEEDS_AVAILABLE", "available": "6"}]


async def test_quote_reservation_counted(ctx: Ctx, c: SimpleNamespace):
    await ctx.db.execute(update(ProductVariant).where(ProductVariant.id == c.black.id).values(reserved_qty=Decimal(5)))
    await ctx.db.commit()
    res = await quote(ctx, [{"variantId": c.black.id, "qty": 2}])
    assert res.status_code == 200
    assert res.json()["lines"][0]["issues"] == [{"code": "EXCEEDS_AVAILABLE", "available": "1"}]


async def test_quote_on_order_without_stock_ok(ctx: Ctx, c: SimpleNamespace):
    res = await quote(ctx, [{"variantId": c.slide_v.id, "qty": 20}])
    assert res.status_code == 200
    assert res.json()["lines"][0]["issues"] == []


async def test_quote_inactive_and_missing_variant(ctx: Ctx, c: SimpleNamespace):
    await ctx.db.execute(update(ProductVariant).where(ProductVariant.id == c.white.id).values(is_active=False))
    await ctx.db.commit()
    res = await quote(
        ctx,
        [
            {"variantId": c.white.id, "qty": 1},
            {"variantId": "01900000-0000-7000-8000-000000000000", "qty": 1},
        ],
    )
    assert res.status_code == 200
    assert res.json()["lines"][0]["issues"] == [{"code": "INACTIVE"}]
    assert res.json()["lines"][1]["issues"] == [{"code": "NOT_FOUND"}]
    assert res.json()["hasIssues"] is True


async def test_quote_invalid_qty_format_422(ctx: Ctx, c: SimpleNamespace):
    assert (await quote(ctx, [{"variantId": c.white.id, "qty": "1.2345"}])).status_code == 422
    assert (await quote(ctx, [{"variantId": c.white.id, "qty": 0}])).status_code == 422
