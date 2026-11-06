"""
Savat.

    from app.modules.cart.service import view, blocking_issues
    cart = await view(db, user_id)            # CartView; tranzaksiya ichida ham chaqirsa bo'ladi
    cart.has_blocking_issues, cart.lines      # PricedLine ro'yxati
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.serialize import decimal_str
from app.db import transaction
from app.models import CartItem, Order, OrderItem, ProductVariant, utcnow
from app.modules.cart.schemas import CART_MAX_ITEMS, CartBulkAddInput
from app.modules.catalog.pricing import LineIssue, PricedLine, price_lines

# Buyurtma berishga to'sqinlik qiladigan muammolar.
# EXCEEDS_AVAILABLE to'sqinlik qilmaydi — menejer taklifda miqdorni tuzatadi.
BLOCKING_ISSUES = ("NOT_FOUND", "INACTIVE", "OUT_OF_STOCK", "INVALID", "ZERO", "BELOW_MIN", "NOT_MULTIPLE_OF_STEP")


def is_blocking_issue(code: str) -> bool:
    return code in BLOCKING_ISSUES


def blocking_issues(line: PricedLine) -> list[LineIssue]:
    return [i for i in line.issues if is_blocking_issue(i["code"])]


@dataclass
class CartView:
    lines: list[PricedLine]
    count: int
    items_total: int
    total_weight_kg: float
    total_volume_m3: float
    has_issues: bool
    # True bo'lsa buyurtma berib bo'lmaydi
    has_blocking_issues: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "lines": [line.as_dict() for line in self.lines],
            "count": self.count,
            "itemsTotal": self.items_total,
            "totalWeightKg": self.total_weight_kg,
            "totalVolumeM3": self.total_volume_m3,
            "hasIssues": self.has_issues,
            "hasBlockingIssues": self.has_blocking_issues,
        }


async def view(db: AsyncSession, user_id: str) -> CartView:
    rows = (
        await db.scalars(
            select(CartItem)
            .where(CartItem.user_id == user_id)
            .order_by(CartItem.updated_at)
            .execution_options(populate_existing=True)
        )
    ).all()
    priced = await price_lines(db, user_id, [(r.variant_id, decimal_str(r.qty)) for r in rows])
    return CartView(
        lines=priced.lines,
        count=len(rows),
        items_total=priced.items_total,
        total_weight_kg=priced.total_weight_kg,
        total_volume_m3=priced.total_volume_m3,
        has_issues=priced.has_issues,
        has_blocking_issues=any(blocking_issues(line) for line in priced.lines),
    )


async def _upsert(db: AsyncSession, user_id: str, variant_id: str, qty: str) -> None:
    stmt = insert(CartItem).values(user_id=user_id, variant_id=variant_id, qty=Decimal(qty), updated_at=utcnow())
    async with transaction(db):
        await db.execute(
            stmt.on_conflict_do_update(
                index_elements=[CartItem.user_id, CartItem.variant_id],
                set_={"qty": stmt.excluded.qty, "updated_at": stmt.excluded.updated_at},
            )
        )


async def _existing_qty(db: AsyncSession, user_id: str, variant_id: str) -> Decimal | None:
    return await db.scalar(select(CartItem.qty).where(CartItem.user_id == user_id, CartItem.variant_id == variant_id))


async def set_item(db: AsyncSession, user_id: str, variant_id: str, qty: str) -> CartView:
    """Miqdorni o'rnatadi (qo'shmaydi). Qoidaga zid miqdor saqlanmaydi"""
    await _validate(db, user_id, variant_id, qty)
    await _ensure_capacity(db, user_id, [variant_id])
    await _upsert(db, user_id, variant_id, qty)
    return await view(db, user_id)


async def remove_item(db: AsyncSession, user_id: str, variant_id: str) -> CartView:
    async with transaction(db):
        await db.execute(delete(CartItem).where(CartItem.user_id == user_id, CartItem.variant_id == variant_id))
    return await view(db, user_id)


async def clear(db: AsyncSession, user_id: str) -> None:
    async with transaction(db):
        await db.execute(delete(CartItem).where(CartItem.user_id == user_id))


async def bulk_add(db: AsyncSession, user_id: str, body: CartBulkAddInput) -> dict[str, Any]:
    """SKU ro'yxati bo'yicha qo'shish. Mavjud miqdorga qo'shiladi. Har SKU natijasi alohida"""
    skus = [i.sku for i in body.items]
    variants = (
        await db.execute(
            select(ProductVariant.id, ProductVariant.sku).where(func.lower(ProductVariant.sku).in_([s.lower() for s in skus]))
        )
    ).all()
    by_sku = {v.sku.upper(): v.id for v in variants}
    results: list[dict[str, Any]] = []

    for item in body.items:
        variant_id = by_sku.get(item.sku.upper())
        if not variant_id:
            results.append({"sku": item.sku, "status": "NOT_FOUND"})
            continue
        existing = await _existing_qty(db, user_id, variant_id)
        qty = decimal_str(existing + Decimal(item.qty)) if existing is not None else item.qty
        issues = await _issues_for(db, user_id, variant_id, qty)
        if issues:
            results.append({"sku": item.sku, "status": issues[0]["code"], "issues": issues})
            continue
        try:
            await _ensure_capacity(db, user_id, [variant_id])
        except AppError:
            results.append({"sku": item.sku, "status": "CART_FULL"})
            continue
        await _upsert(db, user_id, variant_id, qty)
        results.append({"sku": item.sku, "status": "ADDED", "qty": qty})
    return {"cart": (await view(db, user_id)).as_dict(), "results": results}


async def reorder(db: AsyncSession, user_id: str, order_id: str) -> dict[str, Any]:
    """
    Eski buyurtmani savatga qo'shadi. Narxlar joriy narx bilan — farq ko'rsatiladi.
    Endi sotilmayotgan tovarlar o'tkazib yuboriladi.
    """
    order = await db.scalar(select(Order.id).where(Order.id == order_id, Order.customer_id == user_id))
    if not order:
        raise AppError.not_found("Buyurtma")
    items = (
        await db.scalars(
            select(OrderItem).where(OrderItem.order_id == order_id, OrderItem.status == "ACTIVE").order_by(OrderItem.created_at)
        )
    ).all()

    added: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for item in items:
        qty = decimal_str(item.qty)
        existing = await _existing_qty(db, user_id, item.variant_id)
        total = decimal_str(existing + item.qty) if existing is not None else qty
        line = (await price_lines(db, user_id, [(item.variant_id, total)])).lines[0]
        hard = next((i for i in line.issues if i["code"] in ("NOT_FOUND", "INACTIVE", "OUT_OF_STOCK")), None)
        if hard:
            skipped.append({"sku": item.sku, "reason": hard["code"]})
            continue
        # Miqdor qoidasi o'zgargan bo'lsa ham qo'shamiz — savatda muammo sifatida ko'rinadi
        await _upsert(db, user_id, item.variant_id, total)
        added.append({"sku": item.sku, "qty": qty, "oldUnitPrice": item.unit_price, "newUnitPrice": line.unit_price})
    return {"cart": (await view(db, user_id)).as_dict(), "added": added, "skipped": skipped}


async def _issues_for(db: AsyncSession, user_id: str, variant_id: str, qty: str) -> list[LineIssue]:
    lines = (await price_lines(db, user_id, [(variant_id, qty)])).lines
    return blocking_issues(lines[0])


async def _validate(db: AsyncSession, user_id: str, variant_id: str, qty: str) -> None:
    issues = await _issues_for(db, user_id, variant_id, qty)
    if not issues:
        return
    issue = issues[0]
    if issue["code"] == "NOT_FOUND":
        raise AppError.not_found("Variant")
    if issue["code"] in ("INACTIVE", "OUT_OF_STOCK"):
        raise AppError(issue["code"], "Tovar hozir sotuvda yo'q", 409)
    raise AppError("INVALID_QTY", "Miqdor qoidaga mos emas", 422, issue)


async def _ensure_capacity(db: AsyncSession, user_id: str, variant_ids: list[str]) -> None:
    count = await db.scalar(select(func.count()).select_from(CartItem).where(CartItem.user_id == user_id)) or 0
    existing = (
        await db.scalar(
            select(func.count()).select_from(CartItem).where(CartItem.user_id == user_id, CartItem.variant_id.in_(variant_ids))
        )
        or 0
    )
    if count - existing + len(variant_ids) > CART_MAX_ITEMS:
        raise AppError("CART_FULL", f"Savatda ko'pi bilan {CART_MAX_ITEMS} xil tovar", 409)
