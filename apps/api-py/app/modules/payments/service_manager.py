"""To'lovlar: menejer tomoni."""

from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.db import transaction
from app.models import CustomerProfile, Payment, Setting, Upload, utcnow
from app.modules.orders.lock import lock_order
from app.modules.payments.schemas import AdminPaymentInput, PaymentListQuery
from app.modules.payments.service_common import _INCLUDE, _apply_confirmed, _load, _not_pending, payable, payment_json
from app.services.audit import audit
from app.services.outbox import add_event

# ───────────── Menejer ─────────────


async def list_payments(db: AsyncSession, q: PaymentListQuery) -> dict[str, Any]:
    conds: list[Any] = []
    if q.status:
        conds.append(Payment.status == q.status)
    if q.customer_id:
        conds.append(Payment.customer_id == q.customer_id)
    if q.order_id:
        conds.append(Payment.order_id == q.order_id)
    # Tasdiq navbatida eng eskisi birinchi
    order_by = Payment.created_at.asc() if q.status == "PENDING" else Payment.created_at.desc()
    rows = await db.scalars(
        select(Payment)
        .options(*_INCLUDE)
        .where(*conds)
        .order_by(order_by)
        .offset((q.page - 1) * q.limit)
        .limit(q.limit)
        .execution_options(populate_existing=True)
    )
    items = [payment_json(p) for p in rows]
    total = await db.scalar(select(func.count()).select_from(Payment).where(*conds)) or 0
    return {"items": items, "total": total, "page": q.page, "limit": q.limit}


async def record(db: AsyncSession, body: AdminPaymentInput, actor: AuthUser) -> dict[str, Any]:
    """Menejer qabul qilgan pul (naqd, bank) — darhol tasdiqlangan"""
    async with transaction(db):
        profile = await db.scalar(select(CustomerProfile.user_id).where(CustomerProfile.user_id == body.customer_id))
        if not profile:
            raise AppError.not_found("Mijoz")
        if body.order_id:
            order = await lock_order(db, body.order_id)
            if order.customer_id != body.customer_id:
                raise AppError("ORDER_CUSTOMER_MISMATCH", "Buyurtma boshqa mijozniki", 422)
            if not payable(order):
                raise AppError("ORDER_NOT_PAYABLE", "Buyurtma hali tasdiqlanmagan yoki bekor qilingan", 409)
        payment = Payment(
            customer_id=body.customer_id,
            order_id=body.order_id,
            amount=body.amount,
            method=body.method,
            comment=body.comment,
            created_by=actor.id,
            status="CONFIRMED",
            confirmed_by=actor.id,
            confirmed_at=utcnow(),
        )
        db.add(payment)
        await db.flush()
        await _apply_confirmed(db, payment, actor)
        payment_id = payment.id
    return await get(db, payment_id)


async def confirm(db: AsyncSession, payment_id: str, actor: AuthUser) -> dict[str, Any]:
    async with transaction(db):
        # Ikki menejer bir vaqtda bossa — faqat bittasi o'tadi
        now = utcnow()
        result = await db.execute(
            update(Payment)
            .where(Payment.id == payment_id, Payment.status == "PENDING")
            .values(status="CONFIRMED", confirmed_by=actor.id, confirmed_at=now, updated_at=now)
            .execution_options(synchronize_session=False)
        )
        if not result.rowcount:  # type: ignore[attr-defined]
            raise await _not_pending(db, payment_id)
        payment = (
            await db.scalars(select(Payment).where(Payment.id == payment_id).execution_options(populate_existing=True))
        ).one()
        await _apply_confirmed(db, payment, actor)
    return await get(db, payment_id)


async def reject(db: AsyncSession, payment_id: str, reason: str, actor: AuthUser) -> dict[str, Any]:
    async with transaction(db):
        now = utcnow()
        result = await db.execute(
            update(Payment)
            .where(Payment.id == payment_id, Payment.status == "PENDING")
            .values(status="REJECTED", reject_reason=reason, confirmed_by=actor.id, confirmed_at=now, updated_at=now)
            .execution_options(synchronize_session=False)
        )
        if not result.rowcount:  # type: ignore[attr-defined]
            raise await _not_pending(db, payment_id)
        await audit(db, actor_id=actor.id, entity="payment", entity_id=payment_id, action="reject", after={"reason": reason})
        await add_event(db, "payment.rejected", {"paymentId": payment_id})
    return await get(db, payment_id)


async def get(db: AsyncSession, payment_id: str) -> dict[str, Any]:
    p = await _load(db, payment_id)
    if not p:
        raise AppError.not_found("To'lov")
    return payment_json(p)


async def receipt_for(db: AsyncSession, payment_id: str, viewer: AuthUser) -> Upload:
    """Chek fayli — egasi yoki menejer"""
    p = await db.scalar(select(Payment).options(selectinload(Payment.receipt)).where(Payment.id == payment_id))
    if not p or (viewer.role == "CUSTOMER" and p.customer_id != viewer.id):
        raise AppError.not_found("To'lov")
    if not p.receipt:
        raise AppError.not_found("Chek")
    return p.receipt


async def payment_info(db: AsyncSession) -> dict[str, Any]:
    """Karta raqami va bank rekvizitlari — o'tkazma qilish uchun"""
    rows = await db.scalars(select(Setting).where(Setting.key.in_(("payment.card", "payment.bank"))))
    values = {r.key: r.value for r in rows}
    return {"card": values.get("payment.card"), "bank": values.get("payment.bank")}
