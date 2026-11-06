"""
Buyurtmani qulflash.

    from app.modules.orders.lock import lock_order, LockedOrder

    async with transaction(db):
        order = await lock_order(db, order_id, expected_version)   # SELECT ... FOR UPDATE
        order.status, order.version, order.grand_total             # Order ustunlari (delegatsiya)
        order.items                                                # faqat ACTIVE qatorlar, created_at bo'yicha
        order.customer_profile                                     # CustomerProfile | None
        order.cutting_lists                                        # _count.cuttingLists
"""

from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models import CustomerProfile, CuttingList, Order, OrderItem


@dataclass
class LockedOrder:
    """lock_order natijasi. Noma'lum atributlar Order'ga uzatiladi (order.status, order.number, ...)"""

    order: Order
    # Faqat faol (ACTIVE) qatorlar
    items: list[OrderItem]
    # order.customer.customerProfile
    customer_profile: CustomerProfile | None
    # _count.cuttingLists
    cutting_lists: int

    def __getattr__(self, name: str) -> Any:
        if name == "order":
            raise AttributeError(name)
        return getattr(self.order, name)


def conflict(details: Any = None) -> AppError:
    return AppError("ORDER_CONFLICT", "Buyurtma boshqa foydalanuvchi tomonidan o'zgartirilgan. Sahifani yangilang", 409, details)


async def lock_order(db: AsyncSession, order_id: str, expected_version: int | None = None) -> LockedOrder:
    """
    Buyurtma qatorini tranzaksiya oxirigacha qulflaydi (SELECT ... FOR UPDATE) va to'liq yuklaydi.
    expected_version berilsa — foydalanuvchi ko'rgan versiya bilan solishtiriladi (409 ORDER_CONFLICT).
    transaction(db) ichida chaqiring.
    """
    locked = (await db.execute(text("SELECT id FROM orders WHERE id = CAST(:id AS uuid) FOR UPDATE"), {"id": order_id})).first()
    if not locked:
        raise AppError.not_found("Buyurtma")

    order = (await db.scalars(select(Order).where(Order.id == order_id).execution_options(populate_existing=True))).one()
    items = list(
        (
            await db.scalars(
                select(OrderItem)
                .where(OrderItem.order_id == order_id, OrderItem.status == "ACTIVE")
                .order_by(OrderItem.created_at, OrderItem.id)
                .execution_options(populate_existing=True)
            )
        ).all()
    )
    profile = (
        await db.scalars(
            select(CustomerProfile).where(CustomerProfile.user_id == order.customer_id).execution_options(populate_existing=True)
        )
    ).one_or_none()
    cutting = await db.scalar(select(func.count()).select_from(CuttingList).where(CuttingList.order_id == order_id)) or 0

    if expected_version is not None and order.version != expected_version:
        raise conflict({"expectedVersion": expected_version, "actualVersion": order.version})
    return LockedOrder(order=order, items=items, customer_profile=profile, cutting_lists=cutting)
