"""
Ochiq katalog javoblari keshi (Redis). Baza uzoqda bo'lsa (har so'rov yuzlab ms) katalog Redis'dan keladi.

Kalit: cache:catalog:<versiya>:<nom>:<qismlar>. Admin tomonda har qanday muvaffaqiyatli o'zgarish
(POST/PUT/PATCH/DELETE /api/v1/admin/...) versiyani oshiradi — eski kalitlar o'qilmaydi va TTL bilan o'chadi.
Redis ishlamasa — kesh chetlab o'tiladi, javob bazadan.
"""

import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import FastAPI, Request, Response
from redis.exceptions import RedisError

from app.core.redis import redis
from app.core.serialize import dump

log = logging.getLogger("app.cache")

VERSION_KEY = "cache:catalog:version"
ADMIN_PREFIX = "/api/v1/admin"
MUTATING = frozenset({"POST", "PUT", "PATCH", "DELETE"})


async def catalog_cached(name: str, ttl: int, produce: Callable[[], Awaitable[Any]], *parts: object) -> Any:
    try:
        version = await redis().get(VERSION_KEY) or "0"
        key = ":".join(["cache:catalog", str(version), name, *map(str, parts)])
        hit = await redis().get(key)
    except RedisError:
        log.warning("Redis ishlamayapti — katalog keshsiz")
        return await produce()
    if hit is not None:
        return json.loads(hit)
    # Javob bilan bir xil shakl (Decimal → satr) — keshdan kelgani bazadan kelganidan farq qilmasin
    value = dump(await produce())
    try:
        await redis().set(key, json.dumps(value, ensure_ascii=False, separators=(",", ":")), ex=ttl)
    except RedisError:
        log.warning("Katalog keshga yozilmadi")
    return value


async def invalidate_catalog() -> None:
    try:
        await redis().incr(VERSION_KEY)
    except RedisError:
        log.warning("Katalog keshi yangilanmadi — TTL tugaguncha eski javob qolishi mumkin")


def install(app: FastAPI) -> None:
    @app.middleware("http")
    async def invalidate_on_admin_write(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        response = await call_next(request)
        if request.method in MUTATING and request.url.path.startswith(ADMIN_PREFIX) and response.status_code < 400:
            await invalidate_catalog()
        return response
