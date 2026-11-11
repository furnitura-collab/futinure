"""Ochiq katalog keshi: takroriy so'rov Redis'dan, admin o'zgarishi keshni yangilaydi"""

from app.models import Category
from tests.support import Ctx, user_with_token


async def _names(ctx: Ctx) -> list[str]:
    res = await ctx.http.get("/api/v1/categories")
    assert res.status_code == 200
    return [c["nameUz"] for c in res.json()]


async def test_repeat_request_served_from_cache(ctx: Ctx):
    await ctx.add(Category(name_uz="Plitalar", name_ru="Плиты", slug="plitalar"))
    assert await _names(ctx) == ["Plitalar"]
    # Bazaga to'g'ridan-to'g'ri yozilgan o'zgarish (admin yo'lidan emas) — kesh TTL tugaguncha ko'rinmaydi
    await ctx.add(Category(name_uz="Kromka", name_ru="Кромка", slug="kromka"))
    assert await _names(ctx) == ["Plitalar"]


async def test_admin_write_invalidates_cache(ctx: Ctx):
    manager = (await user_with_token(ctx, "MANAGER")).auth
    assert await _names(ctx) == []
    res = await ctx.http.post(
        "/api/v1/admin/categories", headers=manager, json={"nameUz": "Kromka", "nameRu": "Кромка", "slug": "kromka"}
    )
    assert res.status_code == 201
    assert await _names(ctx) == ["Kromka"]


async def test_failed_admin_write_keeps_cache(ctx: Ctx):
    manager = (await user_with_token(ctx, "MANAGER")).auth
    await _names(ctx)
    version = await ctx.redis.get("cache:catalog:version")
    res = await ctx.http.post("/api/v1/admin/categories", headers=manager, json={"nameUz": ""})
    assert res.status_code == 422
    assert await ctx.redis.get("cache:catalog:version") == version
