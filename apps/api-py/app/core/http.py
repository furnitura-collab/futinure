"""
Router: endpoint qaytargan qiymat app.core.serialize.dump() orqali JSON'ga aylanadi (FastAPI'ning
jsonable_encoder'i emas — u Decimal'ni float qiladi). Response qaytarilsa — o'zgarishsiz.

    router = api_router("/orders")

    @router.post("", status_code=201)
    async def create(...): return order_dict
"""

import functools
import inspect
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from app.core.serialize import dump


class DumpedJSON(JSONResponse):
    def render(self, content: Any) -> bytes:
        return super().render(dump(content))


def _wrap(endpoint: Callable[..., Any], status_code: int | None) -> Callable[..., Any]:
    @functools.wraps(endpoint)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        result = endpoint(*args, **kwargs)
        if inspect.isawaitable(result):
            result = await result
        if isinstance(result, Response):
            return result
        if status_code == 204:
            return Response(status_code=204)
        return DumpedJSON(result, status_code=status_code or 200)

    return wrapper


class Route(APIRoute):
    def __init__(self, path: str, endpoint: Callable[..., Any], **kwargs: Any) -> None:
        super().__init__(path, _wrap(endpoint, kwargs.get("status_code")), **kwargs)


def api_router(prefix: str = "", **kwargs: Any) -> APIRouter:
    """Barcha yo'llar /api/v1 ostida (main.py qo'shadi)"""
    return APIRouter(prefix=prefix, route_class=Route, **kwargs)
