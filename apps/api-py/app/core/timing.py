"""
So'rov vaqti: Server-Timing sarlavhasi (brauzer DevTools → Network → Timing'da ko'rinadi).

  db;dur=<ms>;desc="<n> q"   — SQL so'rovlar soni va umumiy vaqti
  app;dur=<ms>               — butun so'rov
Sekin so'rov (SLOW_MS dan ko'p) logga yoziladi.
"""

import logging
import time
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI, Request, Response
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine

log = logging.getLogger("app.timing")

SLOW_MS = 1000


@dataclass
class _Stats:
    queries: int = 0
    db_s: float = 0.0


_stats: ContextVar[_Stats | None] = ContextVar("timing_stats", default=None)


def track_engine(engine: AsyncEngine) -> None:
    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def _before(conn: Any, *_: Any) -> None:
        conn.info["query_started"] = time.perf_counter()

    @event.listens_for(engine.sync_engine, "after_cursor_execute")
    def _after(conn: Any, *_: Any) -> None:
        stats = _stats.get()
        if stats is not None:
            stats.queries += 1
            stats.db_s += time.perf_counter() - conn.info.pop("query_started", time.perf_counter())


def install(app: FastAPI) -> None:
    @app.middleware("http")
    async def server_timing(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        stats = _Stats()
        token = _stats.set(stats)
        started = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            _stats.reset(token)
        total_ms = (time.perf_counter() - started) * 1000
        db_ms = stats.db_s * 1000
        response.headers["Server-Timing"] = f'db;dur={db_ms:.0f};desc="{stats.queries} q", app;dur={total_ms:.0f}'
        if total_ms > SLOW_MS:
            log.warning(
                "Sekin: %s %s — %.0f ms (db %.0f ms, %d so'rov)", request.method, request.url.path, total_ms, db_ms, stats.queries
            )
        return response
