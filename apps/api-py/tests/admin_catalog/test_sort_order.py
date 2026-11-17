from types import SimpleNamespace

from app.models import Category, ProductImage
from tests.support import Ctx

# ───────────────────────── Kategoriyalar tartibi ─────────────────────────


async def test_categories_reordered_in_one_request(ctx: Ctx, c: SimpleNamespace, manager, admin):
    ids = [c.arxiv.id, c.plitalar.id, c.furnitura.id]
    res = await ctx.http.put("/api/v1/admin/categories/order", headers=manager, json={"ids": ids})
    assert res.status_code == 204
    assert [(await ctx.get(Category, id_)).sort_order for id_ in ids] == [0, 1, 2]

    lst = (await ctx.http.get("/api/v1/admin/categories", headers=manager)).json()
    roots = [x["id"] for x in lst if x["parentId"] is None]
    assert roots == ids


async def test_mixed_parents_rejected(ctx: Ctx, c: SimpleNamespace, manager, admin):
    res = await ctx.http.put("/api/v1/admin/categories/order", headers=manager, json={"ids": [c.ldsp.id, c.furnitura.id]})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "CATEGORY_PARENT_MISMATCH"
    assert (await ctx.get(Category, c.furnitura.id)).sort_order == 0


async def test_unknown_or_duplicate_ids_rejected(ctx: Ctx, c: SimpleNamespace, manager, admin):
    url = "/api/v1/admin/categories/order"
    unknown = await ctx.http.put(url, headers=manager, json={"ids": [c.plitalar.id, c.board.id]})
    assert unknown.status_code == 404
    dup = await ctx.http.put(url, headers=manager, json={"ids": [c.plitalar.id, c.plitalar.id]})
    assert dup.status_code == 422
    empty = await ctx.http.put(url, headers=manager, json={"ids": []})
    assert empty.status_code == 422


# ───────────────────────── Rasmlar tartibi ─────────────────────────


async def test_images_reordered_only_within_product(ctx: Ctx, c: SimpleNamespace, manager, admin):
    a = ProductImage(product_id=c.board.id, url="/a.webp", sort_order=0)
    b = ProductImage(product_id=c.board.id, url="/b.webp", sort_order=1)
    other = ProductImage(product_id=c.hinge.id, url="/o.webp", sort_order=5)
    await ctx.add(a, b, other)
    res = await ctx.http.put(
        f"/api/v1/admin/products/{c.board.id}/images/order", headers=manager, json={"ids": [b.id, a.id, other.id]}
    )
    assert res.status_code == 204
    assert [(await ctx.get(ProductImage, i.id)).sort_order for i in (a, b, other)] == [1, 0, 5]
