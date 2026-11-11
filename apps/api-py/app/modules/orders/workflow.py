"""
Status o'tishlari va ularning yon ta'sirlari
(docs/02-state-machine.md, "O'tishlar jadvali"). Har o'tish bitta tranzaksiyada:
status + rezerv/qoldiq + ledger + tarix + audit.

    from app.modules.orders import workflow

    await workflow.run_transition(db, order_id, body, actor)   # o'z tranzaksiyasida (admin endpoint)
    async with transaction(db):
        await workflow.apply(db, order_id, body, actor)        # tashqi tranzaksiya ichida (haydovchi topshirishi)
        await workflow.cancel(db, locked_order, reason, actor)
        await workflow.complete_if_settled(db, order_id)       # to'lov tasdiqlanganda ham chaqiriladi

body — TransitionInput (app.modules.orders.schemas).
"""

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.db import transaction
from app.domain.dates import add_days, business_date, to_date
from app.models import Delivery, Order, utcnow
from app.modules.orders import acceptance, inventory
from app.modules.orders.lock import LockedOrder, lock_order
from app.modules.orders.schemas import TransitionInput
from app.modules.orders.state_machine import opt, transition
from app.services.ledger import post_ledger


async def run_transition(db: AsyncSession, order_id: str, body: TransitionInput, actor: AuthUser) -> Any:
    async with transaction(db):
        return await apply(db, order_id, body, actor)


async def _update_delivery(db: AsyncSession, order_id: str, **values: Any) -> None:
    await db.execute(
        update(Delivery).where(Delivery.order_id == order_id).values(**values).execution_options(synchronize_session=False)
    )


async def apply(db: AsyncSession, order_id: str, body: TransitionInput, actor: AuthUser) -> Any:
    """Tashqi tranzaksiya ichida chaqiriladi"""
    order = await lock_order(db, order_id, body.expected_version)
    # Haydovchi faqat o'ziga biriktirilgan buyurtmani ko'radi va o'zgartiradi
    if actor.role == "DRIVER":
        driver_id = await db.scalar(select(Delivery.driver_id).where(Delivery.order_id == order_id))
        if driver_id != actor.id:
            raise AppError.not_found("Buyurtma")
    # Xodim o'zi tegishli bo'lmagan buyurtmaga ham tegishi mumkin; birinchi tekkan menejer biriktiriladi
    assign = {"manager_id": actor.id} if not order.manager_id and actor.role in ("MANAGER", "SUPER_ADMIN") else {}
    comment = opt(body.comment)

    match body.to:
        case "PREPARING":
            # Yangi buyurtmani qabul qilish — shartlar, avans/nasiya tekshiruvi va rezerv; boshqa holatni state machine rad etadi
            if order.status == "NEW":
                return await acceptance.accept(db, order, body, actor, assign)
            return await transition(db, order, "PREPARING", actor, comment=comment, data=assign)
        case "READY":
            from_status = order.status
            await transition(db, order, "READY", actor, comment=comment, data=assign)
            if from_status == "OUT_FOR_DELIVERY":
                await inventory.unship(db, order_id, actor.id, body.comment or "Yetkazilmadi")
                await _update_delivery(db, order_id, status="FAILED", fail_reason=body.comment)
            return None
        case "OUT_FOR_DELIVERY":
            await transition(db, order, "OUT_FOR_DELIVERY", actor, comment=comment, data=assign)
            await _update_delivery(db, order_id, status="IN_TRANSIT", fail_reason=None)
            return await inventory.ship(db, order_id, actor.id)
        case "DELIVERED":
            return await _deliver(db, order, body, actor, assign)
        case "CANCELLED":
            return await cancel(db, order, body.comment, actor)
        case "COMPLETED":
            raise AppError("TRANSITION_FORBIDDEN_ROLE", "Buyurtma to'lov yopilganda avtomatik yakunlanadi", 403)
    return None


async def cancel(db: AsyncSession, order: LockedOrder, reason: str | None, actor: AuthUser) -> None:
    """Mijoz bekor qilishi ham shu yerdan o'tadi — yon ta'sirlar bir joyda"""
    if order.status == "PREPARING" and order.cutting_lists > 0 and actor.role != "SUPER_ADMIN":
        raise AppError("CUTTING_STARTED", "Raspil boshlangan buyurtmani faqat super admin bekor qiladi", 403)
    await transition(db, order, "CANCELLED", actor, comment=reason)
    await inventory.release(db, order.id, actor.id, "Buyurtma bekor qilindi")
    # To'langan pul ledger'da mijoz foydasiga qoladi (balans manfiy — haqdor). Qaytarish to'lovlar bo'limida


async def _deliver(db: AsyncSession, order: LockedOrder, body: TransitionInput, actor: AuthUser, assign: dict[str, Any]) -> None:
    # READY → DELIVERED faqat olib ketishda; yetkazishda bu o'tishni state machine rad etadi
    pickup = order.status == "READY" and order.delivery_type == "PICKUP"
    if pickup and not body.receiver_name:
        raise AppError("RECEIVER_REQUIRED", "Tovarni kim olib ketganini kiriting", 422)
    parts = [f"Qabul qildi: {body.receiver_name}" if body.receiver_name else None, body.comment]
    comment = ". ".join(p for p in parts if p) or None
    term_days = order.customer_profile.payment_term_days if order.customer_profile else 0
    data = dict(assign)
    if order.payment_terms == "CREDIT":
        data["due_date"] = to_date(add_days(business_date(), term_days))

    await transition(db, order, "DELIVERED", actor, comment=comment, data=data)
    if pickup:
        await inventory.ship(db, order.id, actor.id)
    else:
        await _update_delivery(
            db, order.id, status="DELIVERED", delivered_at=utcnow(), receiver_name=body.receiver_name, fail_reason=None
        )

    # Tovar topshirildi — mijoz qarzi paydo bo'ladi (avans oldinroq CREDIT bo'lib tushgan)
    await post_ledger(
        db,
        customer_id=order.customer_id,
        type="DEBIT",
        amount=order.grand_total,
        order_id=order.id,
        description=f"Buyurtma {order.number} topshirildi",
        created_by=actor.id,
    )
    await complete_if_settled(db, order.id)


@dataclass
class _Target:
    id: str
    status: str
    version: int
    delivery_type: str


async def complete_if_settled(db: AsyncSession, order_id: str) -> None:
    """
    DELIVERED → COMPLETED (tizim): to'liq to'langan yoki nasiyaga o'tgan bo'lsa.
    To'lov tasdiqlanganda ham chaqiriladi (tranzaksiya ichida).
    """
    await db.flush()
    o = (
        await db.execute(
            select(
                Order.id,
                Order.status,
                Order.version,
                Order.delivery_type,
                Order.paid_total,
                Order.grand_total,
                Order.payment_terms,
            ).where(Order.id == order_id)
        )
    ).one()
    if o.status != "DELIVERED":
        return
    settled = o.paid_total >= o.grand_total or o.payment_terms == "CREDIT"
    if not settled:
        return
    comment = "Nasiyaga o'tdi" if o.payment_terms == "CREDIT" and o.paid_total < o.grand_total else "To'liq to'landi"
    await transition(db, _Target(o.id, o.status, o.version, o.delivery_type), "COMPLETED", None, comment=comment)
