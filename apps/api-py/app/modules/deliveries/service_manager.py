"""Yetkazish: menejer (haydovchilar, biriktirish)."""

from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.db import transaction
from app.domain.dates import to_date
from app.models import Delivery, Order, User, new_id, utcnow
from app.modules.deliveries.schemas import AssignDeliveryInput
from app.modules.deliveries.service_common import ACTIVE, ASSIGNABLE
from app.services.audit import audit
from app.services.outbox import add_event

# ───────────── Menejer ─────────────


async def drivers(db: AsyncSession) -> list[dict[str, Any]]:
    """Faol haydovchilar va ulardagi faol yetkazishlar soni"""
    active = (
        select(func.count())
        .select_from(Delivery)
        .join(Order, Order.id == Delivery.order_id)
        .where(Delivery.driver_id == User.id, Order.status.in_(ACTIVE))
        .correlate(User)
        .scalar_subquery()
    )
    rows = await db.execute(
        select(User.id, User.full_name, User.phone, active)
        .where(User.role == "DRIVER", User.is_active.is_(True))
        .order_by(User.full_name.asc())
    )
    return [{"id": r[0], "fullName": r[1], "phone": r[2], "_count": {"deliveries": r[3]}} for r in rows]


async def assign(db: AsyncSession, order_id: str, body: AssignDeliveryInput, actor: AuthUser) -> None:
    fields = body.model_fields_set
    async with transaction(db):
        lock = text("SELECT id FROM orders WHERE id = CAST(:id AS uuid) FOR UPDATE")
        locked = (await db.execute(lock, {"id": order_id})).first()
        if not locked:
            raise AppError.not_found("Buyurtma")
        order = (
            await db.execute(
                select(Order.status, Order.delivery_type, Order.delivery_date, Order.vehicle_type).where(Order.id == order_id)
            )
        ).one()
        before = await db.scalar(select(Delivery).where(Delivery.order_id == order_id).execution_options(populate_existing=True))
        if order.delivery_type != "DELIVERY":
            raise AppError("NOT_A_DELIVERY", "Bu buyurtma olib ketiladi — haydovchi kerak emas", 422)
        if order.status not in ASSIGNABLE:
            raise AppError(
                "DELIVERY_LOCKED",
                "Haydovchini faqat yo'lga chiqqunga qadar almashtirish mumkin",
                409,
                {"status": order.status},
            )
        if body.driver_id:
            driver = await db.scalar(
                select(User.id).where(User.id == body.driver_id, User.role == "DRIVER", User.is_active.is_(True)).limit(1)
            )
            if not driver:
                raise AppError("NOT_A_DRIVER", "Bunday faol haydovchi yo'q", 422)

        if "scheduled_date" in fields:
            scheduled = to_date(body.scheduled_date) if body.scheduled_date else None
        else:
            scheduled = before.scheduled_date if before and before.scheduled_date is not None else order.delivery_date
        if "slot" in fields:
            slot = body.slot
        else:
            slot = before.slot if before else None
        if "vehicle_type" in fields:
            vehicle = body.vehicle_type
        else:
            vehicle = before.vehicle_type if before and before.vehicle_type is not None else order.vehicle_type
        now = utcnow()
        data = {
            "driver_id": body.driver_id,
            "scheduled_date": scheduled,
            "slot": slot,
            "vehicle_type": vehicle,
            "assigned_by": actor.id,
            # Muvaffaqiyatsiz urinishdan keyin qayta biriktirilsa — yangi urinish
            "status": "ASSIGNED",
        }
        await db.execute(
            insert(Delivery)
            .values(id=new_id(), order_id=order_id, created_at=now, updated_at=now, **data)
            .on_conflict_do_update(index_elements=[Delivery.order_id], set_={**data, "updated_at": now})
        )
        await audit(
            db,
            actor_id=actor.id,
            entity="order",
            entity_id=order_id,
            action="delivery:assign",
            before=before and {"driverId": before.driver_id, "scheduledDate": before.scheduled_date},
            after={"driverId": body.driver_id, "scheduledDate": scheduled},
        )
        prev = before.driver_id if before else None
        await add_event(
            db,
            "delivery.assigned",
            {
                "orderId": order_id,
                "driverId": body.driver_id,
                "previousDriverId": prev if prev and prev != body.driver_id else None,
            },
        )
