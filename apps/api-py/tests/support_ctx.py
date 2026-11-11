"""Test konteksti: fake yuboruvchilar, Ctx, assert_matches"""

import re
from dataclasses import dataclass
from typing import Any, TypeVar

import httpx
from redis.asyncio import Redis
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.senders import PushMessage

T = TypeVar("T")

# ───────────────────────── Fake yuboruvchilar ─────────────────────────


class FakeSms:
    """Yuborilgan SMS'larni ushlab qoladi"""

    def __init__(self) -> None:
        self.sent: list[dict[str, str]] = []

    async def send(self, phone: str, text: str) -> None:
        self.sent.append({"phone": phone, "text": text})

    def last_code(self, phone: str) -> str:
        msg = next((m for m in reversed(self.sent) if m["phone"] == phone), None)
        found = re.search(r"\d{6}", msg["text"]) if msg else None
        if not found:
            raise AssertionError(f"{phone} uchun SMS yo'q")
        return found.group()


class FakePush:
    def __init__(self) -> None:
        self.sent: list[PushMessage] = []
        # Shu tokenlar "ilova o'chirilgan" deb qaytariladi
        self.invalid: set[str] = set()

    async def send(self, messages: list[PushMessage]) -> list[str]:
        self.sent.extend(messages)
        return [m.to for m in messages if m.to in self.invalid]


class FakeTelegram:
    def __init__(self) -> None:
        self.messages: list[str] = []

    async def send(self, html: str) -> None:
        self.messages.append(html)


# ───────────────────────── Kontekst ─────────────────────────


@dataclass
class Ctx:
    http: httpx.AsyncClient
    # To'g'ridan-to'g'ri baza (Prisma o'rniga). Yozgandan keyin commit() — API ko'rishi uchun
    db: AsyncSession
    redis: Redis
    sms: FakeSms
    push: FakePush
    telegram: FakeTelegram

    async def get(self, model: type[T], id: Any) -> T:
        """Bazadagi joriy holat (API o'zgartirgan bo'lsa ham yangisi) — findUniqueOrThrow"""
        obj = await self.db.get(model, id, populate_existing=True)
        assert obj is not None, f"{model.__name__} {id} topilmadi"
        return obj

    async def all(self, stmt: Select[Any]) -> list[Any]:
        return list((await self.db.execute(stmt.execution_options(populate_existing=True))).scalars())

    async def first(self, stmt: Select[Any]) -> Any:
        return (await self.db.execute(stmt.execution_options(populate_existing=True))).scalars().first()

    async def count(self, model: type, *where: Any) -> int:
        return await self.db.scalar(select(func.count()).select_from(model).where(*where)) or 0

    async def add(self, *objs: Any) -> None:
        self.db.add_all(objs)
        await self.db.commit()


# ───────────────────────── Tekshiruvlar ─────────────────────────


def assert_matches(actual: Any, expected: Any, path: str = "$") -> None:
    """Vitest toMatchObject: expected'dagi kalitlar actual'da bir xil (qolgan kalitlar e'tiborsiz)"""
    if isinstance(expected, dict):
        assert isinstance(actual, dict), f"{path}: dict kutilgan, {actual!r}"
        for k, v in expected.items():
            assert k in actual, f"{path}.{k} yo'q: {actual!r}"
            assert_matches(actual[k], v, f"{path}.{k}")
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(actual) == len(expected), f"{path}: {actual!r} != {expected!r}"
        for i, (a, e) in enumerate(zip(actual, expected, strict=True)):
            assert_matches(a, e, f"{path}[{i}]")
    else:
        assert actual == expected, f"{path}: {actual!r} != {expected!r}"
