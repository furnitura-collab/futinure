"""Mijoz buyurtmalari: ko'rish, bekor qilish, takliflar tarixi."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import row
from app.db import transaction
from app.domain.state_machine import CUSTOMER_CANCELLABLE
from app.models import Order, OrderItem, OrderStatusHistory, Payment, Warehouse
from app.modules.orders import workflow
from app.modules.orders.lock import lock_order
from app.modules.orders.service_list import amount_due


async def detail(db: AsyncSession, customer_id: str, order_id: str) -> dict[str, Any]:
    order = (
        await db.scalars(
            select(Order).where(Order.id == order_id, Order.customer_id == customer_id).execution_options(populate_existing=True)
        )
    ).first()
    if not order:
        raise AppError.not_found("Buyurtma")
    items = (
        await db.scalars(
            select(OrderItem)
            .where(OrderItem.order_id == order_id, OrderItem.status == "ACTIVE")
            .order_by(OrderItem.created_at, OrderItem.id)
            .execution_options(populate_existing=True)
        )
    ).all()
    history = (
        await db.execute(
            select(
                OrderStatusHistory.from_status,
                OrderStatusHistory.to_status,
                OrderStatusHistory.comment,
                OrderStatusHistory.created_at,
            )
            .where(OrderStatusHistory.order_id == order_id)
            .order_by(OrderStatusHistory.created_at, OrderStatusHistory.id)
        )
    ).all()
    warehouse = None
    if order.pickup_warehouse_id:
        w = (
            await db.execute(
                select(Warehouse.id, Warehouse.name, Warehouse.address_text, Warehouse.phone, Warehouse.work_hours).where(
                    Warehouse.id == order.pickup_warehouse_id
                )
            )
        ).one_or_none()
        if w:
            warehouse = {"id": w.id, "name": w.name, "addressText": w.address_text, "phone": w.phone, "workHours": w.work_hours}
    payments = (
        await db.execute(
            select(Payment.id, Payment.amount, Payment.method, Payment.status, Payment.created_at, Payment.reject_reason)
            .where(Payment.order_id == order_id)
            .order_by(Payment.created_at.desc())
        )
    ).all()

    # Ichki maydonlar mijozga ko'rsatilmaydi
    return {
        **row(order, exclude=("idempotency_key", "cancelled_by")),
        "items": [row(i) for i in items],
        "statusHistory": [
            {"fromStatus": h.from_status, "toStatus": h.to_status, "comment": h.comment, "createdAt": h.created_at}
            for h in history
        ],
        "pickupWarehouse": warehouse,
        "payments": [
            {
                "id": p.id,
                "amount": p.amount,
                "method": p.method,
                "status": p.status,
                "createdAt": p.created_at,
                "rejectReason": p.reject_reason,
            }
            for p in payments
        ],
        "balanceDue": order.grand_total - order.paid_total,
        "amountDue": amount_due(order, list(payments)),
        "canCancel": order.status in CUSTOMER_CANCELLABLE,
    }


async def cancel(db: AsyncSession, customer: AuthUser, order_id: str, reason: str) -> dict[str, Any]:
    async with transaction(db):
        order = await lock_order(db, order_id)
        if order.customer_id != customer.id:
            raise AppError.not_found("Buyurtma")
        await workflow.cancel(db, order, reason, customer)
    return await detail(db, customer.id, order_id)
