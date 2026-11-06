"""
E2E testlar: ilova jarayon ichida (httpx + ASGI), haqiqiy Postgres va Redis bilan.
Test bazasi avtomatik yaratiladi va Alembic migratsiyalari qo'llanadi; har testdan oldin jadvallar tozalanadi.

Parallel ishlatish uchun (masalan ikki terminalda): TEST_DATABASE_URL, TEST_REDIS_DB.
"""

import asyncio
import os
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://mebel:mebel@localhost:5433/mebel_test")
REDIS_DB = os.environ.get("TEST_REDIS_DB", "1")

# Ilova import qilinishidan OLDIN — get_settings() shularni o'qiydi
os.environ.update(
    NODE_ENV="test",
    DATABASE_URL=DB_URL,
    REDIS_URL=f"redis://localhost:6380/{REDIS_DB}",
    JWT_ACCESS_SECRET="test-access-secret-test-access-secret-0123",
    JWT_ACCESS_TTL="15m",
    OTP_PEPPER="test-otp-pepper-test-otp-pepper-test-0123",
    SMS_PROVIDER="console",
    OTP_TEST_PHONES="+998900000001",
    UPLOAD_DIR=str(Path(tempfile.gettempdir()) / f"mebel-test-uploads-{REDIS_DB}"),
)

import asyncpg  # noqa: E402
import httpx  # noqa: E402
import pytest  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app import db as db_mod  # noqa: E402
from app.core.redis import redis  # noqa: E402
from app.main import app as asgi_app  # noqa: E402
from app.services.senders import override_senders  # noqa: E402
from tests.support import Ctx, FakePush, FakeSms, FakeTelegram  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
async def _database() -> AsyncIterator[None]:
    """Test bazasini yaratadi (bo'lmasa) va migratsiyalarni qo'llaydi"""
    name = DB_URL.rsplit("/", 1)[1].split("?")[0]
    admin = await asyncpg.connect(DB_URL.rsplit("/", 1)[0] + "/mebel")
    if not await admin.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", name):
        await admin.execute(f'CREATE DATABASE "{name}"')
    await admin.close()
    proc = await asyncio.create_subprocess_exec(
        "alembic", "upgrade", "head", cwd=ROOT, env=os.environ, stderr=asyncio.subprocess.PIPE
    )
    _, err = await proc.communicate()
    if proc.returncode:
        raise RuntimeError(f"alembic upgrade: {err.decode()}")
    yield
    await db_mod.dispose()


@pytest.fixture(scope="session")
async def _fakes() -> tuple[FakeSms, FakePush, FakeTelegram]:
    sms, push, telegram = FakeSms(), FakePush(), FakeTelegram()
    override_senders(sms=sms, push=push, telegram=telegram)
    return sms, push, telegram


@pytest.fixture(scope="session")
async def _http() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=asgi_app, client=("127.0.0.1", 50000))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
async def ctx(_http: httpx.AsyncClient, _fakes: tuple[FakeSms, FakePush, FakeTelegram]) -> AsyncIterator[Ctx]:
    """Har test toza bazadan boshlanadi (resetDb)"""
    sms, push, telegram = _fakes
    async with db_mod.session_factory()() as session:
        tables = (
            await session.execute(
                text("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'alembic_version'")
            )
        ).scalars()
        await session.execute(text(f"TRUNCATE {', '.join(f'"{t}"' for t in tables)} RESTART IDENTITY CASCADE"))
        await session.commit()
    await redis().flushdb()
    sms.sent.clear()
    push.sent.clear()
    push.invalid.clear()
    telegram.messages.clear()

    async with db_mod.session_factory()() as session:
        yield Ctx(http=_http, db=session, redis=redis(), sms=sms, push=push, telegram=telegram)
        await session.rollback()
