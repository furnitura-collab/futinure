"""
Buyurtma bo'yicha ombor amallari.
Hammasi chaqiruvchining tranzaksiyasida.

Qancha band qilingani alohida saqlanmaydi — stock_movements'dan hisoblanadi
(RESERVE − RELEASE). Shuning uchun bo'shatish har doim aniq band qilingan miqdorni qaytaradi.

    from app.modules.orders import inventory
    await inventory.reserve(db, order_id, actor_id)
    await inventory.release(db, order_id, actor_id, "Buyurtma bekor qilindi")
    await inventory.ship(db, order_id, actor_id)         # yo'lga chiqdi / olib ketildi
    await inventory.unship(db, order_id, actor_id, reason)
    await inventory.net_reserved(db, order_id)          # {variant_id: Decimal}
"""

from decimal import Decimal
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.serialize import decimal_str
from app.models import OrderItem, ProductVariant, StockMovement


def _move(
    db: AsyncSession, variant_id: str, type: str, qty: Decimal, order_id: str, actor_id: str | None, reason: str | None = None
) -> None:
    db.add(StockMovement(variant_id=variant_id, type=type, qty=qty, order_id=order_id, user_id=actor_id, reason=reason))


async def reserve(db: AsyncSession, order_id: str, actor_id: str | None) -> None:
    """
    Tasdiqlashda: har variant uchun atomik band qilish.
    "Buyurtma asosida" (ON_ORDER) tovar qoldiq yetmasa band qilinmaydi — kelganda jo'natiladi.
    """
    need = await _item_totals(db, order_id)
    variants = (
        await db.execute(
            select(ProductVariant.id, ProductVariant.sku, ProductVariant.availability).where(ProductVariant.id.in_(list(need)))
        )
    ).all()
    shortages: list[dict[str, Any]] = []

    # Doim bir xil tartibda — ikki buyurtma bir-birini kutib qolmasin (deadlock)
    for v in sorted(variants, key=lambda r: r.id):
        qty = need[v.id]
        updated = await db.execute(
            text(
                "UPDATE product_variants SET reserved_qty = reserved_qty + CAST(:qty AS numeric) "
                "WHERE id = CAST(:id AS uuid) AND stock_qty - reserved_qty >= CAST(:qty AS numeric)"
            ),
            {"qty": decimal_str(qty), "id": v.id},
        )
        if updated.rowcount == 1:  # type: ignore[attr-defined]
            _move(db, v.id, "RESERVE", qty, order_id, actor_id)
        elif v.availability != "ON_ORDER":
            fresh = (
                await db.execute(select(ProductVariant.stock_qty, ProductVariant.reserved_qty).where(ProductVariant.id == v.id))
            ).one()
            shortages.append(
                {"sku": v.sku, "requested": decimal_str(qty), "available": decimal_str(fresh.stock_qty - fresh.reserved_qty)}
            )
    await db.flush()
    if shortages:
        raise AppError(
            "INSUFFICIENT_STOCK",
            "Omborda yetarli tovar yo'q. Miqdorni tuzatib taklif yuboring",
            409,
            {"shortages": shortages},
        )


async def release(db: AsyncSession, order_id: str, actor_id: str | None, reason: str) -> None:
    """Bekor qilishda: band qilinganini to'liq qaytaradi"""
    for variant_id, qty in (await net_reserved(db, order_id)).items():
        await db.execute(
            text("UPDATE product_variants SET reserved_qty = reserved_qty - CAST(:qty AS numeric) WHERE id = CAST(:id AS uuid)"),
            {"qty": decimal_str(qty), "id": variant_id},
        )
        _move(db, variant_id, "RELEASE", qty, order_id, actor_id, reason)
    await db.flush()


async def ship(db: AsyncSession, order_id: str, actor_id: str | None) -> None:
    """Jo'natishda (yo'lga chiqdi / olib ketildi): qoldiqdan yechiladi, rezerv yopiladi"""
    need = await _item_totals(db, order_id)
    reserved = await net_reserved(db, order_id)
    ids = sorted(need)
    rows = (
        await db.execute(
            text(
                "SELECT id::text AS id, sku, stock_qty, reserved_qty FROM product_variants "
                "WHERE id = ANY(CAST(:ids AS uuid[])) ORDER BY id FOR UPDATE"
            ),
            {"ids": ids},
        )
    ).all()

    missing = []
    for r in rows:
        qty = need[r.id]
        own = reserved.get(r.id, Decimal(0))
        # Boshqa buyurtmalar uchun band qilinganiga tegmasdan yechish mumkin bo'lgan miqdor
        free = Decimal(r.stock_qty) - Decimal(r.reserved_qty) + own
        if free < qty:
            missing.append({"sku": r.sku, "requested": decimal_str(qty), "available": decimal_str(free)})
    if missing:
        raise AppError("STOCK_NOT_RECEIVED", "Tovar omborda yetarli emas — avval kirim qiling", 409, {"shortages": missing})

    for vid in ids:
        qty = need[vid]
        own_reserve = reserved.get(vid)
        if own_reserve:
            _move(db, vid, "RELEASE", own_reserve, order_id, actor_id, "Jo'natildi")
        await db.execute(
            text(
                "UPDATE product_variants SET stock_qty = stock_qty - CAST(:qty AS numeric), "
                "reserved_qty = reserved_qty - CAST(:own AS numeric) WHERE id = CAST(:id AS uuid)"
            ),
            {"qty": decimal_str(qty), "own": decimal_str(own_reserve or Decimal(0)), "id": vid},
        )
        _move(db, vid, "OUT", qty, order_id, actor_id)
        await db.flush()


async def unship(db: AsyncSession, order_id: str, actor_id: str | None, reason: str) -> None:
    """Yetkazib bo'lmadi: tovar omborga qaytadi va yana shu buyurtmaga band qilinadi"""
    rows = (
        await db.execute(
            text(
                "SELECT variant_id::text AS variant_id, SUM(CASE type WHEN 'OUT' THEN qty ELSE -qty END) AS qty "
                "FROM stock_movements WHERE order_id = CAST(:id AS uuid) AND type IN ('OUT', 'IN') "
                "GROUP BY variant_id HAVING SUM(CASE type WHEN 'OUT' THEN qty ELSE -qty END) > 0 "
                "ORDER BY variant_id"
            ),
            {"id": order_id},
        )
    ).all()
    for r in rows:
        qty = Decimal(r.qty)
        await db.execute(
            text(
                "UPDATE product_variants SET stock_qty = stock_qty + CAST(:qty AS numeric), "
                "reserved_qty = reserved_qty + CAST(:qty AS numeric) WHERE id = CAST(:id AS uuid)"
            ),
            {"qty": decimal_str(qty), "id": r.variant_id},
        )
        _move(db, r.variant_id, "IN", qty, order_id, actor_id, reason)
        _move(db, r.variant_id, "RESERVE", qty, order_id, actor_id, reason)
        await db.flush()


async def net_reserved(db: AsyncSession, order_id: str) -> dict[str, Decimal]:
    """Shu buyurtma uchun hozir band qilingan miqdor (variant bo'yicha)"""
    await db.flush()
    rows = (
        await db.execute(
            text(
                "SELECT variant_id::text AS variant_id, SUM(CASE type WHEN 'RESERVE' THEN qty ELSE -qty END) AS qty "
                "FROM stock_movements WHERE order_id = CAST(:id AS uuid) AND type IN ('RESERVE', 'RELEASE') "
                "GROUP BY variant_id HAVING SUM(CASE type WHEN 'RESERVE' THEN qty ELSE -qty END) > 0 "
                "ORDER BY variant_id"
            ),
            {"id": order_id},
        )
    ).all()
    return {r.variant_id: Decimal(r.qty) for r in rows}


async def _item_totals(db: AsyncSession, order_id: str) -> dict[str, Decimal]:
    """Faol qatorlar bo'yicha har variantga jami miqdor (bir variant ikki qatorda bo'lishi mumkin)"""
    await db.flush()
    items = (
        await db.execute(
            select(OrderItem.variant_id, OrderItem.qty).where(OrderItem.order_id == order_id, OrderItem.status == "ACTIVE")
        )
    ).all()
    totals: dict[str, Decimal] = {}
    for i in items:
        if i.qty == 0:
            continue
        totals[i.variant_id] = totals.get(i.variant_id, Decimal(0)) + i.qty
    return totals
