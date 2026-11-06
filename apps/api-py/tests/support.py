"""
Test yordamchilari: kontekst, fake yuboruvchilar, fixture ma'lumotlar (foydalanuvchi, katalog, ombor, manzil).

    async def test_x(ctx: Ctx):
        c = await seed_catalog(ctx)
        customer = await user_with_token(ctx, "CUSTOMER")
        res = await ctx.http.post("/api/v1/cart/items", headers=customer.auth, json={...})
        assert res.status_code == 201
        assert_matches(res.json(), {"count": 1})
"""

import re
from dataclasses import dataclass, field
from decimal import Decimal
from types import SimpleNamespace
from typing import Any, TypeVar

import httpx
from redis.asyncio import Redis
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import tokens
from app.models import (
    Address,
    Brand,
    Category,
    CustomerProfile,
    PriceGroup,
    Product,
    ProductVariant,
    User,
    VariantGroupPrice,
    VariantPriceTier,
    Warehouse,
)
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


# ───────────────────────── Fixture ma'lumotlar ─────────────────────────

_phone_seq = 0


@dataclass
class UserCtx:
    user: User
    token: str
    refresh_token: str
    auth: dict[str, str] = field(default_factory=dict)


async def user_with_token(ctx: Ctx, role: str, *, price_group_id: str | None = None) -> UserCtx:
    """OTP'siz foydalanuvchi + token (testlarni tezlashtirish uchun)"""
    global _phone_seq
    _phone_seq += 1
    user = User(phone=f"+99893{_phone_seq:07d}", role=role, full_name=f"{role} {_phone_seq}")
    ctx.db.add(user)
    await ctx.db.flush()
    if role == "CUSTOMER":
        ctx.db.add(CustomerProfile(user_id=user.id, price_group_id=price_group_id))
    await ctx.db.commit()
    pair = await tokens.issue(ctx.db, user.id, user.role)
    return UserCtx(user, pair["accessToken"], pair["refreshToken"], {"Authorization": f"Bearer {pair['accessToken']}"})


async def login(ctx: Ctx, phone: str) -> dict[str, Any]:
    """OTP orqali kirib, javobni qaytaradi ({accessToken, refreshToken, user})"""
    res = await ctx.http.post("/api/v1/auth/otp/request", json={"phone": phone})
    assert res.status_code == 200, res.text
    res = await ctx.http.post("/api/v1/auth/otp/verify", json={"phone": phone, "code": ctx.sms.last_code(phone)})
    assert res.status_code == 200, res.text
    return res.json()


async def seed_catalog(ctx: Ctx) -> SimpleNamespace:
    """
    Kichik katalog:
      plitalar > ldsp : LDSP 16 (W980 — 120 dona, pog'onalar, usta narxi; 0190 — 6 dona, kam)
      furnitura      : Petlya (min 2, qadam 2, 400 dona), Yo'naltiruvchi 500 (0 dona, buyurtma asosida)
      arxiv (nofaol) : Eski mahsulot
    """
    db = ctx.db
    usta = PriceGroup(name="Usta")
    plitalar = Category(slug="plitalar", name_uz="Plitalar", name_ru="Плиты")
    furnitura = Category(slug="furnitura", name_uz="Furnitura", name_ru="Фурнитура")
    arxiv = Category(slug="arxiv", name_uz="Arxiv", name_ru="Архив", is_active=False)
    kronospan = Brand(name="Kronospan")
    db.add_all([usta, plitalar, furnitura, arxiv, kronospan])
    await db.flush()
    ldsp = Category(slug="ldsp", name_uz="LDSP", name_ru="ЛДСП", parent_id=plitalar.id)
    db.add(ldsp)
    await db.flush()

    board = Product(
        code="LDSP-16",
        category_id=ldsp.id,
        brand_id=kronospan.id,
        name_uz="LDSP Kronospan 16 mm",
        name_ru="ЛДСП Kronospan 16 мм",
        unit="SHEET",
        kind="BOARD",
        weight_kg=Decimal(45),
        volume_m3=Decimal("0.092"),
        board_length_mm=2800,
        board_width_mm=2070,
        thickness_mm=Decimal(16),
    )
    hinge = Product(
        code="PETLYA",
        category_id=furnitura.id,
        name_uz="Petlya dovodchikli",
        name_ru="Петля с доводчиком",
        unit="PIECE",
        min_qty=Decimal(2),
        qty_step=Decimal(2),
        weight_kg=Decimal("0.1"),
    )
    slide = Product(code="SLIDE", category_id=furnitura.id, name_uz="Sharikli yo'naltiruvchi", name_ru="Направляющие", unit="SET")
    old = Product(code="OLD", category_id=arxiv.id, name_uz="Eski mahsulot", name_ru="Старый товар", unit="PIECE")
    db.add_all([board, hinge, slide, old])
    await db.flush()

    white = ProductVariant(
        product_id=board.id,
        sku="KR-W980-16",
        attributes={"color": "Oq", "decor_code": "W980"},
        base_price=395_000,
        stock_qty=Decimal(120),
        low_stock_threshold=Decimal(10),
    )
    black = ProductVariant(
        product_id=board.id,
        sku="KR-0190-16",
        attributes={"color": "Qora", "decor_code": "0190"},
        base_price=420_000,
        stock_qty=Decimal(6),
        low_stock_threshold=Decimal(10),
    )
    hinge_v = ProductVariant(
        product_id=hinge.id, sku="GTV-PB-110", base_price=14_000, stock_qty=Decimal(400), low_stock_threshold=Decimal(50)
    )
    slide_v = ProductVariant(product_id=slide.id, sku="GTV-SL-500", base_price=49_000, availability="ON_ORDER", lead_time_days=7)
    old_v = ProductVariant(product_id=old.id, sku="OLD-1", base_price=1000, stock_qty=Decimal(5))
    db.add_all([white, black, hinge_v, slide_v, old_v])
    await db.flush()
    db.add_all(
        [
            VariantPriceTier(variant_id=white.id, min_qty=Decimal(10), price=385_000),
            VariantPriceTier(variant_id=white.id, min_qty=Decimal(50), price=375_000),
            VariantGroupPrice(variant_id=white.id, price_group_id=usta.id, price=380_000),
        ]
    )
    await db.commit()
    return SimpleNamespace(
        usta=usta, plitalar=plitalar, ldsp=ldsp, furnitura=furnitura, arxiv=arxiv, kronospan=kronospan,
        board=board, white=white, black=black, hinge=hinge, hinge_v=hinge_v, slide=slide, slide_v=slide_v, old=old,
    )  # fmt: skip


async def seed_warehouse(ctx: Ctx) -> Warehouse:
    w = Warehouse(name="Asosiy ombor", address_text="Toshkent, Sergeli", lat=41.22, lng=69.22)
    await ctx.add(w)
    return w


async def seed_address(ctx: Ctx, user_id: str) -> Address:
    a = Address(user_id=user_id, label="Sex", address_text="Toshkent, Chilonzor 5-kvartal", lat=41.28, lng=69.2, floor=2)
    await ctx.add(a)
    return a
