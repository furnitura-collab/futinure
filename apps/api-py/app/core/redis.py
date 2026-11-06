from typing import Annotated

from fastapi import Depends
from redis.asyncio import Redis

from app.config import get_settings

_client: Redis | None = None


def redis() -> Redis:
    global _client
    if _client is None:
        _client = Redis.from_url(get_settings().REDIS_URL, decode_responses=True, socket_timeout=10)
    return _client


async def close() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
    _client = None


RedisDep = Annotated[Redis, Depends(redis)]
