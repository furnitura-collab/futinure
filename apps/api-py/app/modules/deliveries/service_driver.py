"""Yetkazish: haydovchi ilovasi va topshirish surati."""

from typing import Any

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import pick
from app.db import transaction
from app.domain.dates import business_date, day_start
from app.models import Delivery, Order, OrderItem, Upload, utcnow
from app.modules.deliveries.schemas import DriverDeliverInput, DriverFailInput, DriverStartInput
from app.modules.deliveries.service_common import _ITEM_FIELDS, _LOAD, ACTIVE, DELIVERY_PROOF_PURPOSE, _present
from app.modules.orders import workflow
from app.modules.orders.schemas import TransitionInput
from app.modules.payments import service as payments

# ───────────── Haydovchi ─────────────


async def driver_list(db: AsyncSession, driver: AuthUser) -> dict[str, Any]:
    """Faol yetkazishlar (sana bo'yicha) va bugun topshirilganlar"""
    today = business_date()
    rows = list(
        await db.scalars(
            select(Delivery)
            .options(_LOAD)
            .join(Order, Order.id == Delivery.order_id)
            .where(
                Delivery.driver_id == driver.id,
                or_(Order.status.in_(ACTIVE), Delivery.delivered_at >= day_start(today)),
            )
            .order_by(Delivery.scheduled_date.asc().nulls_last(), Delivery.created_at.asc())
            .execution_options(populate_existing=True)
        )
    )
    items = await _present(db, rows)
    return {
        "today": today,
        "active": [d for d in items if d["order"]["status"] in ACTIVE],
        "done": [d for d in items if d["order"]["status"] not in ACTIVE],
    }


async def driver_detail(db: AsyncSession, order_id: str, driver: AuthUser) -> dict[str, Any]:
    d = await db.scalar(
        select(Delivery)
        .options(_LOAD)
        .where(Delivery.order_id == order_id, Delivery.driver_id == driver.id)
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if not d:
        raise AppError.not_found("Buyurtma")
    items = await db.scalars(
        select(OrderItem)
        .where(OrderItem.order_id == order_id, OrderItem.status == "ACTIVE")
        .order_by(OrderItem.created_at.asc(), OrderItem.id.asc())
        .execution_options(populate_existing=True)
    )
    (presented,) = await _present(db, [d])
    presented["order"]["items"] = [pick(i, *_ITEM_FIELDS) for i in items]
    return presented


async def start(db: AsyncSession, order_id: str, body: DriverStartInput, driver: AuthUser) -> dict[str, Any]:
    await workflow.run_transition(
        db, order_id, TransitionInput(to="OUT_FOR_DELIVERY", expected_version=body.expected_version), driver
    )
    return await driver_detail(db, order_id, driver)


async def deliver(db: AsyncSession, order_id: str, body: DriverDeliverInput, driver: AuthUser) -> dict[str, Any]:
    """Topshirish: status + surat + naqd pul — bitta tranzaksiyada"""
    async with transaction(db):
        proof_upload_id: str | None = None
        if body.proof_upload_id:
            upload = (
                await db.execute(
                    select(Upload.id, Delivery.id.label("delivery_id"))
                    .outerjoin(Delivery, Delivery.proof_upload_id == Upload.id)
                    .where(
                        Upload.id == body.proof_upload_id,
                        Upload.owner_id == driver.id,
                        Upload.purpose == DELIVERY_PROOF_PURPOSE,
                    )
                    .limit(1)
                )
            ).first()
            if not upload:
                raise AppError.not_found("Surat")
            if upload.delivery_id:
                raise AppError("PROOF_ALREADY_USED", "Surat boshqa yetkazishga biriktirilgan", 409)
            proof_upload_id = upload.id

        await workflow.apply(
            db,
            order_id,
            TransitionInput(
                to="DELIVERED",
                receiver_name=body.receiver_name,
                comment=body.comment,
                expected_version=body.expected_version,
            ),
            driver,
        )

        cash = body.cash_collected or 0
        result = await db.execute(
            update(Delivery)
            .where(Delivery.order_id == order_id)
            .values(proof_upload_id=proof_upload_id, cash_collected=cash if cash > 0 else None, updated_at=utcnow())
            .execution_options(synchronize_session=False)
        )
        if not result.rowcount:  # type: ignore[attr-defined]
            raise AppError("NOT_FOUND", "Yozuv topilmadi", 404)
        if cash > 0:
            # Buyurtma apply() ichida qulflangan; paid_total o'zgarmagan (DELIVERED o'tishi uni o'zgartirmaydi)
            o = (
                await db.execute(
                    select(Order.id, Order.customer_id, Order.grand_total, Order.paid_total).where(Order.id == order_id)
                )
            ).one()
            await payments.create_driver_cash(db, o, cash, driver)
    return await driver_detail(db, order_id, driver)


async def fail(db: AsyncSession, order_id: str, body: DriverFailInput, driver: AuthUser) -> dict[str, Any]:
    """Yetkazib bo'lmadi — tovar omborga qaytadi (READY), menejer qayta rejalashtiradi"""
    await workflow.run_transition(
        db, order_id, TransitionInput(to="READY", comment=body.reason, expected_version=body.expected_version), driver
    )
    return await driver_detail(db, order_id, driver)


# ───────────── Surat ─────────────


async def proof_for(db: AsyncSession, order_id: str, viewer: AuthUser) -> Upload:
    """Topshirish surati — xodimlar yoki shu yetkazishning haydovchisi"""
    d = await db.scalar(select(Delivery).options(selectinload(Delivery.proof)).where(Delivery.order_id == order_id))
    if not d or (viewer.role == "DRIVER" and d.driver_id != viewer.id):
        raise AppError.not_found("Buyurtma")
    if not d.proof:
        raise AppError.not_found("Surat")
    return d.proof
