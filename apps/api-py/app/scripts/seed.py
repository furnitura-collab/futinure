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
from app.scripts.seed_data import CATEGORIES, PRODUCTS, SETTINGS, USERS, VEHICLES


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
