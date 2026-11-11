from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.core.timing import track_engine

# Supabase transaction pooler (pgbouncer rejimi) — prepared statement'larni qo'llamaydi
TRANSACTION_POOLER_PORT = 6543
# Pooler uzoq turgan ulanishni yopishi mumkin — har so'rovda ping (+1 round-trip) o'rniga vaqti-vaqti bilan yangilanadi
POOL_RECYCLE_S = 300

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def engine() -> AsyncEngine:
    global _engine, _sessionmaker
    if _engine is None:
        url = get_settings().async_database_url
        no_prepared = make_url(url).port == TRANSACTION_POOLER_PORT
        _engine = create_async_engine(
            url,
            pool_recycle=POOL_RECYCLE_S,
            # Kesh bo'lsa takroriy so'rov 1 round-trip; o'chiq bo'lsa har safar qayta prepare (+1)
            connect_args={"statement_cache_size": 0} if no_prepared else {},
            **({"prepared_statement_cache_size": 0} if no_prepared else {}),
        )
        track_engine(_engine)
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False, autoflush=True)
    return _engine


def session_factory() -> async_sessionmaker[AsyncSession]:
    engine()
    assert _sessionmaker is not None
    return _sessionmaker


async def dispose() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = _sessionmaker = None


async def get_db() -> AsyncIterator[AsyncSession]:
    """So'rov sessiyasi. Yozish faqat transaction() ichida — commit javobdan OLDIN bo'ladi."""
    async with session_factory()() as session:
        try:
            yield session
        finally:
            # transaction()'dan tashqaridagi o'qishlar ochiq qolmasin
            await session.rollback()


Db = Annotated[AsyncSession, Depends(get_db)]


@asynccontextmanager
async def transaction(db: AsyncSession) -> AsyncIterator[AsyncSession]:
    """
    Prisma $transaction o'rniga. Muvaffaqiyatda commit, xatoda rollback.
    Ichma-ich chaqirilsa — tashqi tranzaksiyaning bir qismi (alohida commit yo'q).
    """
    depth = db.info.get("tx_depth", 0)
    db.info["tx_depth"] = depth + 1
    try:
        yield db
        if depth == 0:
            await db.commit()
    except BaseException:
        if depth == 0:
            await db.rollback()
        raise
    finally:
        db.info["tx_depth"] = depth


@asynccontextmanager
async def standalone_session() -> AsyncIterator[AsyncSession]:
    """So'rovdan tashqari ishlar uchun (fon vazifalari, skriptlar)"""
    async with session_factory()() as session:
        try:
            yield session
        finally:
            await session.rollback()
