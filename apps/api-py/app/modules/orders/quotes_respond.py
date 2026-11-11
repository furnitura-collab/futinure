"""Takliflar: mijoz qabul qiladi yoki rad etadi."""

from decimal import Decimal
from typing import Any

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.db import transaction
from app.models import OrderItem, OrderQuote, utcnow
from app.modules.orders import inventory
from app.modules.orders.lock import LockedOrder, lock_order
from app.modules.orders.state_machine import transition
from app.modules.orders.terms import terms_data

# ───────────── Mijoz: qabul / rad ─────────────


async def accept(db: AsyncSession, customer: AuthUser, order_id: str, quote_id: str) -> None:
    async with transaction(db):
        order, quote, changes = await _active_quote(db, customer, order_id, quote_id)
        if order.version != changes["orderVersion"]:
            raise AppError("ORDER_CONFLICT", "Buyurtma taklifdan keyin o'zgargan", 409)

        await _apply_lines(db, order_id, changes["lines"])
        await recalc_weight(db, order_id)
        totals = quote.totals
        quote.status = "ACCEPTED"
        quote.responded_at = utcnow()
        await db.flush()
        await transition(db, order, "CONFIRMED", customer, data=terms_data(changes["terms"], totals))
        await inventory.reserve(db, order_id, customer.id)


async def reject(db: AsyncSession, customer: AuthUser, order_id: str, quote_id: str, comment: str) -> None:
    async with transaction(db):
        order, quote, _ = await _active_quote(db, customer, order_id, quote_id)
        quote.status = "REJECTED"
        quote.customer_comment = comment
        quote.responded_at = utcnow()
        await db.flush()
        await transition(db, order, "NEW", customer, comment=comment, data={"current_quote_id": None})


async def _active_quote(
    db: AsyncSession, customer: AuthUser, order_id: str, quote_id: str
) -> tuple[LockedOrder, OrderQuote, dict[str, Any]]:
    order = await lock_order(db, order_id)
    if order.customer_id != customer.id:
        raise AppError.not_found("Buyurtma")
    quote = (
        await db.scalars(
            select(OrderQuote)
            .where(OrderQuote.id == quote_id, OrderQuote.order_id == order_id)
            .execution_options(populate_existing=True)
        )
    ).first()
    if not quote:
        raise AppError.not_found("Taklif")
    if order.status != "QUOTED" or order.current_quote_id != quote.id or quote.status != "PENDING":
        raise AppError("QUOTE_NOT_ACTIVE", "Bu taklif endi amal qilmaydi", 409, {"status": quote.status})
    if quote.expires_at < utcnow():
        raise AppError("QUOTE_EXPIRED", "Taklif muddati o'tgan. Menejer yangi taklif yuboradi", 409)
    return order, quote, quote.changes


async def _apply_lines(db: AsyncSession, order_id: str, lines: list[dict[str, Any]]) -> None:
    for ln in lines:
        action = ln["action"]
        if action == "KEEP":
            continue
        if action == "CHANGE":
            await _update_item(db, ln["itemId"], qty=Decimal(ln["qty"]), unit_price=ln["unitPrice"], line_total=ln["lineTotal"])
        elif action == "REMOVE":
            await _update_item(db, ln["itemId"], status="REMOVED")
        elif action in ("REPLACE", "ADD"):
            if action == "REPLACE":
                await _update_item(db, ln["itemId"], status="REMOVED")
            db.add(
                OrderItem(
                    order_id=order_id,
                    variant_id=ln["variantId"],
                    sku=ln["sku"],
                    name_uz=ln["nameUz"],
                    name_ru=ln["nameRu"],
                    unit=ln["unit"],
                    attributes=ln.get("attributes") if ln.get("attributes") is not None else {},
                    requested_qty=Decimal(ln["qty"]),
                    qty=Decimal(ln["qty"]),
                    unit_price=ln["unitPrice"],
                    line_total=ln["lineTotal"],
                    replaced_item_id=ln["itemId"] if action == "REPLACE" else None,
                )
            )
            await db.flush()


async def _update_item(db: AsyncSession, item_id: str, **values: Any) -> None:
    result = await db.execute(
        update(OrderItem).where(OrderItem.id == item_id).values(**values).execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:  # type: ignore[attr-defined]
        raise AppError("NOT_FOUND", "Yozuv topilmadi", 404)


async def recalc_weight(db: AsyncSession, order_id: str) -> None:
    """Tarkib o'zgargach og'irlik va hajm (yetkazishda mashina tanlash uchun)"""
    await db.execute(
        text(
            """
            UPDATE orders SET
              total_weight_kg = t.weight,
              total_volume_m3 = t.volume
            FROM (
              SELECT COALESCE(SUM(oi.qty * COALESCE(p.weight_kg, 0)), 0) AS weight,
                     COALESCE(SUM(oi.qty * COALESCE(p.volume_m3, 0)), 0) AS volume
              FROM order_items oi
              JOIN product_variants v ON v.id = oi.variant_id
              JOIN products p ON p.id = v.product_id
              WHERE oi.order_id = CAST(:id AS uuid) AND oi.status = 'ACTIVE'
            ) t
            WHERE orders.id = CAST(:id AS uuid)
            """
        ),
        {"id": order_id},
    )
