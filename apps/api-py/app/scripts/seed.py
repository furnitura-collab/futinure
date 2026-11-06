"""
Demo ma'lumotlar. Qayta ishga tushirish xavfsiz (upsert).
Kirish: demo raqamlar, parol DEMO_PASSWORD (standart: demo1234).

    uv run python -m app.scripts.seed
"""

import asyncio
import os
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.password import hash_password
from app.db import dispose, standalone_session
from app.models import (
    Brand,
    Category,
    CustomerProfile,
    PriceGroup,
    Product,
    ProductVariant,
    Setting,
    User,
    VariantGroupPrice,
    VariantPriceTier,
    VehicleType,
    Warehouse,
)

USERS = [
    ("+998900000001", "Super Admin", "SUPER_ADMIN"),
    ("+998900000002", "Menejer ", "MANAGER"),
    ("+998900000003", "Omborchi ", "WAREHOUSE"),
    ("+998900000004", "Haydovchi ", "DRIVER"),
    ("+998900000005", "Usta ", "CUSTOMER"),
]

CATEGORIES: list[dict[str, str]] = [
    {"slug": "plitalar", "nameUz": "Plitalar", "nameRu": "Плиты"},
    {"slug": "ldsp", "nameUz": "LDSP", "nameRu": "ЛДСП", "parent": "plitalar"},
    {"slug": "mdf", "nameUz": "MDF", "nameRu": "МДФ", "parent": "plitalar"},
    {"slug": "kromka", "nameUz": "Kromka", "nameRu": "Кромка"},
    {"slug": "furnitura", "nameUz": "Furnitura", "nameRu": "Фурнитура"},
    {"slug": "petlya", "nameUz": "Petlyalar", "nameRu": "Петли", "parent": "furnitura"},
    {"slug": "yonaltiruvchi", "nameUz": "Yo'naltiruvchilar", "nameRu": "Направляющие", "parent": "furnitura"},
    {"slug": "ruchka", "nameUz": "Ruchkalar", "nameRu": "Ручки", "parent": "furnitura"},
    {"slug": "mahkamlagich", "nameUz": "Mahkamlagichlar", "nameRu": "Крепёж"},
]

BOARD_16 = {"length": 2800, "width": 2070, "thickness": 16}

PRODUCTS: list[dict[str, Any]] = [
    {
        "code": "LDSP-KR-16", "category": "ldsp", "brand": "Kronospan",
        "nameUz": "LDSP Kronospan 16 mm", "nameRu": "ЛДСП Kronospan 16 мм",
        "unit": "SHEET", "kind": "BOARD", "weightKg": 45, "volumeM3": "0.092", "board": BOARD_16,
        "variants": [
            {"sku": "KR-W980-16", "attributes": {"color": "Oq", "decor_code": "W980", "thickness": 16}, "price": 395_000,
             "stock": 120, "tiers": [(10, 385_000), (50, 375_000)], "usta": 380_000, "diler": 368_000},
            {"sku": "KR-K001-16", "attributes": {"color": "Yong'oq", "decor_code": "K001", "thickness": 16}, "price": 445_000,
             "stock": 40, "tiers": [(10, 435_000)], "usta": 430_000},
            {"sku": "KR-0190-16", "attributes": {"color": "Qora", "decor_code": "0190", "thickness": 16}, "price": 420_000, "stock": 6},
        ],
    },
    {
        "code": "LDSP-EG-18", "category": "ldsp", "brand": "Egger",
        "nameUz": "LDSP Egger 18 mm", "nameRu": "ЛДСП Egger 18 мм",
        "unit": "SHEET", "kind": "BOARD", "weightKg": 52, "volumeM3": "0.104",
        "board": {"length": 2800, "width": 2070, "thickness": 18},
        "variants": [
            {"sku": "EG-H1145-18", "attributes": {"color": "Bardolino eman", "decor_code": "H1145", "thickness": 18},
             "price": 610_000, "stock": 25},
            {"sku": "EG-U999-18", "attributes": {"color": "Qora", "decor_code": "U999", "thickness": 18}, "price": 590_000, "stock": 0},
        ],
    },
    {
        "code": "MDF-16", "category": "mdf",
        "nameUz": "MDF 16 mm (bo'yalmagan)", "nameRu": "МДФ 16 мм (некрашеный)",
        "unit": "SHEET", "kind": "BOARD", "weightKg": 55, "volumeM3": "0.094", "board": BOARD_16,
        "variants": [{"sku": "MDF-16", "attributes": {"thickness": 16}, "price": 340_000, "stock": 60}],
    },
    {
        "code": "KROMKA-PVX-RH", "category": "kromka", "brand": "Rehau",
        "nameUz": "PVX kromka 2 mm", "nameRu": "Кромка ПВХ 2 мм",
        "unit": "METER", "kind": "EDGE", "minQty": 1, "qtyStep": "0.5", "weightKg": "0.05", "volumeM3": "0.0001",
        "variants": [
            {"sku": "RH-2-W980", "attributes": {"color": "Oq", "decor_code": "W980", "thickness": 2, "width": 22}, "price": 4_500,
             "stock": 3000, "tiers": [(100, 4_200)]},
            {"sku": "RH-2-K001", "attributes": {"color": "Yong'oq", "decor_code": "K001", "thickness": 2, "width": 22},
             "price": 5_000, "stock": 1200},
            {"sku": "RH-04-W980", "attributes": {"color": "Oq", "decor_code": "W980", "thickness": 0.4, "width": 19},
             "price": 1_500, "stock": 5000},
        ],
    },
    {
        "code": "PETLYA-BLUM", "category": "petlya", "brand": "Blum",
        "nameUz": "Petlya Blum Clip top (dovodchikli)", "nameRu": "Петля Blum Clip top (с доводчиком)",
        "unit": "PIECE", "minQty": 2, "qtyStep": 2, "weightKg": "0.12", "volumeM3": "0.0002",
        "variants": [{"sku": "BLUM-71B3550", "attributes": {"angle": "110°"}, "price": 48_000, "stock": 400,
                      "tiers": [(50, 45_000)], "usta": 46_000}],
    },
    {
        "code": "PETLYA-GTV", "category": "petlya", "brand": "GTV",
        "nameUz": "Petlya GTV (dovodchikli)", "nameRu": "Петля GTV (с доводчиком)",
        "unit": "PIECE", "minQty": 2, "qtyStep": 2, "weightKg": "0.1", "volumeM3": "0.0002",
        "variants": [{"sku": "GTV-PB-110", "attributes": {"angle": "110°"}, "price": 14_000, "stock": 1500, "tiers": [(100, 12_500)]}],
    },
    {
        "code": "YONALT-GTV", "category": "yonaltiruvchi", "brand": "GTV",
        "nameUz": "Sharikli yo'naltiruvchi", "nameRu": "Шариковые направляющие",
        "unit": "SET", "weightKg": "0.9", "volumeM3": "0.002",
        "variants": [
            {"sku": "GTV-SL-350", "attributes": {"length": 350}, "price": 38_000, "stock": 200},
            {"sku": "GTV-SL-450", "attributes": {"length": 450}, "price": 45_000, "stock": 180},
            {"sku": "GTV-SL-500", "attributes": {"length": 500}, "price": 49_000, "stock": 0},
        ],
    },
    {
        "code": "RUCHKA-128", "category": "ruchka",
        "nameUz": "Ruchka profil 128 mm", "nameRu": "Ручка профиль 128 мм",
        "unit": "PIECE", "weightKg": "0.06", "volumeM3": "0.0001",
        "variants": [
            {"sku": "RCH-128-BLK", "attributes": {"color": "Qora", "length": 128}, "price": 18_000, "stock": 300},
            {"sku": "RCH-128-GLD", "attributes": {"color": "Oltin", "length": 128}, "price": 22_000, "stock": 120},
        ],
    },
    {
        "code": "KONFIRMAT-7x50", "category": "mahkamlagich",
        "nameUz": "Konfirmat 7×50", "nameRu": "Конфирмат 7×50",
        "unit": "PACK", "weightKg": "1.1", "volumeM3": "0.001",
        "variants": [{"sku": "KONF-7x50-100", "attributes": {"pack": "100 dona"}, "price": 35_000, "stock": 90}],
    },
]  # fmt: skip

VEHICLES = [
    {
        "code": "DAMAS",
        "name": "Damas",
        "max_weight_kg": 500,
        "max_volume_m3": Decimal("2.5"),
        "max_length_mm": 1900,
        "sort_order": 1,
    },
    {"code": "LABO", "name": "Labo", "max_weight_kg": 800, "max_volume_m3": Decimal(4), "max_length_mm": 2900, "sort_order": 2},
    {
        "code": "ISUZU",
        "name": "Isuzu",
        "max_weight_kg": 3500,
        "max_volume_m3": Decimal(18),
        "max_length_mm": 4300,
        "sort_order": 3,
    },
]

SETTINGS: dict[str, Any] = {
    "payment.card": {"number": "8600 0000 0000 0000", "holder": "MEBEL ORDER MCHJ"},
    "payment.bank": {"name": "Kapitalbank", "account": "20208000000000000001", "mfo": "01158", "inn": "300000000"},
    "quote.ttl_hours": 24,
    "cutting.price_per_meter": 3_000,
    "cutting.edging_price_per_meter": 2_500,
}


def _dec(v: Any) -> Decimal | None:
    return None if v is None else Decimal(str(v))


async def _upsert(db: AsyncSession, model: Any, key: str, values: dict[str, Any], update: dict[str, Any] | None = None) -> Any:
    """Prisma upsert: key bo'yicha bor bo'lsa — update (bo'sh bo'lsa tegilmaydi), yo'q bo'lsa — yaratiladi"""
    obj = await db.scalar(select(model).where(getattr(model, key) == values[key]))
    if obj is None:
        obj = model(**values)
        db.add(obj)
    else:
        for k, v in (update or {}).items():
            setattr(obj, k, v)
    await db.flush()
    return obj


async def seed(db: AsyncSession) -> dict[str, int]:
    # Demo hisoblar paroli; foydalanuvchi o'zi almashtirgan parol qayta yozilmaydi
    demo_hash = await hash_password(os.environ.get("DEMO_PASSWORD") or "demo1234")
    for phone, full_name, role in USERS:
        user = await _upsert(
            db,
            User,
            "phone",
            {"phone": phone, "full_name": full_name, "role": role, "password_hash": demo_hash},
            {"full_name": full_name, "role": role},
        )
        if not user.password_hash:
            user.password_hash = demo_hash
        if role == "CUSTOMER" and not await db.get(CustomerProfile, user.id):
            db.add(CustomerProfile(user_id=user.id, type="MASTER"))
    await db.flush()

    usta = await _upsert(db, PriceGroup, "name", {"name": "Usta"})
    diler = await _upsert(db, PriceGroup, "name", {"name": "Diler"})

    aziz = await db.scalar(select(User).where(User.phone == "+998900000005"))
    assert aziz is not None
    profile = await db.get(CustomerProfile, aziz.id)
    assert profile is not None
    profile.price_group_id = usta.id
    profile.credit_limit = 10_000_000
    profile.payment_term_days = 15
    profile.allowed_payment_methods = ["CASH", "CARD_TRANSFER", "BANK_TRANSFER"]

    category_ids: dict[str, str] = {}
    for i, c in enumerate(CATEGORIES):
        parent_id = category_ids.get(c["parent"]) if "parent" in c else None
        data = {"name_uz": c["nameUz"], "name_ru": c["nameRu"], "parent_id": parent_id, "sort_order": i}
        row = await _upsert(db, Category, "slug", {"slug": c["slug"], **data}, data)
        category_ids[c["slug"]] = row.id

    for p in PRODUCTS:
        brand = await _upsert(db, Brand, "name", {"name": p["brand"]}) if p.get("brand") else None
        existing = await db.scalar(select(ProductVariant.product_id).where(ProductVariant.sku == p["variants"][0]["sku"]))
        board = p.get("board") or {}
        data = {
            "code": p["code"],
            "category_id": category_ids[p["category"]],
            "brand_id": brand.id if brand else None,
            "name_uz": p["nameUz"],
            "name_ru": p["nameRu"],
            "unit": p["unit"],
            "kind": p.get("kind", "GOODS"),
            "min_qty": _dec(p.get("minQty", 1)),
            "qty_step": _dec(p.get("qtyStep", 1)),
            "weight_kg": _dec(p.get("weightKg")),
            "volume_m3": _dec(p.get("volumeM3")),
            "board_length_mm": board.get("length"),
            "board_width_mm": board.get("width"),
            "thickness_mm": _dec(board.get("thickness")),
        }
        if existing:
            product = await db.get(Product, existing)
            assert product is not None
            for k, v in data.items():
                setattr(product, k, v)
        else:
            product = Product(**data)
            db.add(product)
        await db.flush()

        for v in p["variants"]:
            variant = await _upsert(
                db,
                ProductVariant,
                "sku",
                {
                    "product_id": product.id,
                    "sku": v["sku"],
                    "attributes": v["attributes"],
                    "base_price": v["price"],
                    "stock_qty": Decimal(v["stock"]),
                    "low_stock_threshold": Decimal(10 if p["unit"] == "SHEET" else 50),
                    "availability": "IN_STOCK" if v["stock"] > 0 else "OUT_OF_STOCK",
                },
                {"attributes": v["attributes"], "base_price": v["price"]},
            )
            await db.execute(delete(VariantPriceTier).where(VariantPriceTier.variant_id == variant.id))
            for min_qty, price in v.get("tiers", []):
                db.add(VariantPriceTier(variant_id=variant.id, min_qty=Decimal(min_qty), price=price))
            await db.execute(delete(VariantGroupPrice).where(VariantGroupPrice.variant_id == variant.id))
            for group, price in ((usta, v.get("usta")), (diler, v.get("diler"))):
                if price:
                    db.add(VariantGroupPrice(variant_id=variant.id, price_group_id=group.id, price=price))
            await db.flush()

    if not await db.scalar(select(func.count()).select_from(Warehouse)):
        db.add(
            Warehouse(
                name="Asosiy ombor (Sergeli)",
                address_text="Toshkent, Sergeli tumani, Yangi Sergeli ko'chasi",
                lat=41.2275,
                lng=69.2205,
                phone="+998712000000",
                work_hours="Du–Sha 08:00–18:00",
            )
        )

    for vt in VEHICLES:
        await db.execute(insert(VehicleType).values(**vt).on_conflict_do_update(index_elements=["code"], set_=vt))

    for key, value in SETTINGS.items():
        await db.execute(insert(Setting).values(key=key, value=value).on_conflict_do_nothing(index_elements=["key"]))

    await db.commit()
    counts = {}
    for name, model in (("users", User), ("categories", Category), ("products", Product), ("variants", ProductVariant)):
        counts[name] = await db.scalar(select(func.count()).select_from(model)) or 0
    return counts


async def main() -> None:
    async with standalone_session() as db:
        print("Seed tayyor:", await seed(db))
    await dispose()


if __name__ == "__main__":
    asyncio.run(main())
