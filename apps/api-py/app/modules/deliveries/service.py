"""
Yetkazish va haydovchi ilovasi.

    from app.modules.deliveries import service as deliveries

    await deliveries.assign(db, order_id, body, actor)      # menejer: haydovchi biriktirish
    await deliveries.driver_list(db, driver)                # haydovchi: faol va bugun topshirilganlar
    await deliveries.deliver(db, order_id, body, driver)    # status + surat + naqd pul — bitta tranzaksiyada
"""

from typing import Any

from sqlalchemy import func, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import pick
from app.db import transaction
from app.domain.dates import business_date, day_start, to_date
from app.models import Delivery, Order, OrderItem, Payment, Upload, User, new_id, utcnow
from app.modules.deliveries.schemas import AssignDeliveryInput, DriverDeliverInput, DriverFailInput, DriverStartInput
from app.modules.orders import workflow
from app.modules.orders.schemas import TransitionInput
from app.modules.payments import service as payments
from app.services.audit import audit
from app.services.outbox import add_event

DELIVERY_PROOF_PURPOSE = "DELIVERY_PROOF"

# Shu statuslarda haydovchi biriktirish/almashtirish mumkin (yo'lga chiqqandan keyin — yo'q)
ASSIGNABLE = ("CONFIRMED", "PREPARING", "READY")
# Haydovchi ro'yxatidagi "faol" yetkazishlar
ACTIVE = ("CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY")

# deliverySelect — Prisma select tartibida
_DELIVERY_FIELDS = (
    "id",
    "order_id",
    "status",
    "scheduled_date",
    "slot",
    "vehicle_type",
    "receiver_name",
    "delivered_at",
    "fail_reason",
    "cash_collected",
    "proof_upload_id",
)
# orderSelect (grandTotal/paidTotal/payments/_count present() ichida olib tashlanadi)
_ORDER_FIELDS = (
    "id",
    "number",
    "status",
    "version",
    "customer_id",
    "address_snapshot",
    "delivery_date",
    "delivery_slot",
    "total_weight_kg",
    "payment_terms",
    "customer_comment",
)
_ITEM_FIELDS = ("id", "sku", "name_uz", "name_ru", "unit", "qty", "attributes")

_LOAD = selectinload(Delivery.order).selectinload(Order.customer).selectinload(User.customer_profile)


async def _present(db: AsyncSession, rows: list[Delivery]) -> list[dict[str, Any]]:
    """Haydovchiga ko'rinadigan shakl: narxlar yo'q, faqat olinadigan summa"""
    ids = [d.order_id for d in rows]
    if not ids:
        return []
    pending = dict(
        (
            await db.execute(
                select(Payment.order_id, func.sum(Payment.amount))
                .where(Payment.order_id.in_(ids), Payment.status == "PENDING")
                .group_by(Payment.order_id)
            )
        ).all()
    )
    counts = dict(
        (
            await db.execute(
                select(OrderItem.order_id, func.count())
                .where(OrderItem.order_id.in_(ids), OrderItem.status == "ACTIVE")
                .group_by(OrderItem.order_id)
            )
        ).all()
    )
    out = []
    for d in rows:
        o = d.order
        due = o.grand_total - o.paid_total - int(pending.get(o.id) or 0)
        profile = o.customer.customer_profile
        out.append(
            pick(
                d,
                *_DELIVERY_FIELDS,
                order=pick(
                    o,
                    *_ORDER_FIELDS,
                    customer={
                        "fullName": o.customer.full_name,
                        "phone": o.customer.phone,
                        "customerProfile": profile and {"companyName": profile.company_name},
                    },
                    itemsCount=counts.get(o.id, 0),
                    # Nasiyada pul olinmaydi; qolgan holatda — to'lanmagan qoldiq
                    toCollect=0 if o.payment_terms == "CREDIT" or due < 0 else due,
                ),
            )
        )
    return out


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
