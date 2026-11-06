"""
Ombor: kirim, inventarizatsiya, kam qolganlar.

    from app.modules.catalog.stock import lock_variant
    v = await lock_variant(db, variant_id)     # SELECT ... FOR UPDATE (tranzaksiya ichida!)
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.schemas import Page, paginated
from app.core.serialize import decimal_str, pick, row
from app.db import transaction
from app.models import Order, ProductVariant, StockMovement, utcnow
from app.modules.catalog.schemas import StockAdjust, StockIn
from app.services.audit import audit


@dataclass(frozen=True)
class LockedVariant:
    id: str
    stock_qty: Decimal
    reserved_qty: Decimal


async def lock_variant(db: AsyncSession, variant_id: str) -> LockedVariant:
    """SELECT ... FOR UPDATE: parallel kirim/rezerv bir-birini buzmasin. Topilmasa 404 Variant"""
    r = (
        await db.execute(
            text("SELECT id, stock_qty, reserved_qty FROM product_variants WHERE id = CAST(:id AS uuid) FOR UPDATE"),
            {"id": variant_id},
        )
    ).first()
    if not r:
        raise AppError.not_found("Variant")
    return LockedVariant(str(r.id), r.stock_qty, r.reserved_qty)


async def move(db: AsyncSession, body: StockIn | StockAdjust, actor: AuthUser) -> dict[str, Any]:
    async with transaction(db):
        v = await lock_variant(db, body.variant_id)
        before = {"stockQty": v.stock_qty, "reservedQty": v.reserved_qty}

        if isinstance(body, StockIn):
            delta = Decimal(body.qty)
        else:
            actual = Decimal(body.actual_qty)
            delta = actual - v.stock_qty
            if delta == 0:
                raise AppError("NO_CHANGE", "Qoldiq o'zgarmagan")
            if actual < v.reserved_qty:
                raise AppError(
                    "STOCK_BELOW_RESERVED",
                    "Haqiqiy qoldiq buyurtmalarga band qilinganidan kam. Avval buyurtmalarni ko'rib chiqing",
                    409,
                    {"reservedQty": decimal_str(v.reserved_qty)},
                )

        updated = (
            await db.execute(
                update(ProductVariant)
                .where(ProductVariant.id == v.id)
                .values(stock_qty=ProductVariant.stock_qty + delta, updated_at=utcnow())
                .returning(ProductVariant.id, ProductVariant.sku, ProductVariant.stock_qty, ProductVariant.reserved_qty)
            )
        ).one()
        variant = {"id": updated.id, "sku": updated.sku, "stockQty": updated.stock_qty, "reservedQty": updated.reserved_qty}
        movement = StockMovement(variant_id=v.id, type=body.type, qty=delta, reason=body.reason, user_id=actor.id)
        db.add(movement)
        await db.flush()
        await audit(
            db,
            actor_id=actor.id,
            entity="variant",
            entity_id=v.id,
            action=f"stock_{body.type.lower()}",
            before=before,
            after=variant,
        )
    return {"variant": variant, "movement": row(movement)}


async def low_stock(db: AsyncSession) -> list[dict[str, Any]]:
    rows = await db.execute(
        text("""
      SELECT v.id AS variant_id, v.sku, p.id AS product_id, p.name_uz, p.unit::text AS unit,
             v.stock_qty, v.reserved_qty, v.stock_qty - v.reserved_qty AS available_qty,
             v.low_stock_threshold, v.availability = 'ON_ORDER' AS on_order
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      WHERE v.is_active AND p.is_active AND v.stock_qty - v.reserved_qty <= v.low_stock_threshold
      ORDER BY (v.stock_qty - v.reserved_qty) ASC, p.name_uz ASC
      LIMIT 500""")
    )
    out = []
    for r in rows.mappings():
        d = dict(r)
        d["variant_id"] = str(d["variant_id"])
        d["product_id"] = str(d["product_id"])
        out.append(d)
    return out


async def movements(db: AsyncSession, variant_id: str, q: Page) -> dict[str, Any]:
    items = (
        await db.scalars(
            select(StockMovement)
            .where(StockMovement.variant_id == variant_id)
            .order_by(StockMovement.created_at.desc())
            .offset(q.offset)
            .limit(q.limit)
        )
    ).all()
    order_ids = {m.order_id for m in items if m.order_id}
    orders = {o.id: o for o in (await db.scalars(select(Order).where(Order.id.in_(order_ids)))).all()} if order_ids else {}
    total = await db.scalar(select(func.count()).select_from(StockMovement).where(StockMovement.variant_id == variant_id))
    return paginated(
        [row(m, order=pick(orders[m.order_id], "id", "number") if m.order_id in orders else None) for m in items],
        total or 0,
        q,
    )
