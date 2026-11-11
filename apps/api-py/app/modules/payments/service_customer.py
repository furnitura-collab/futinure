"""To'lovlar: mijoz va haydovchi tomoni."""

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import row
from app.db import transaction
from app.models import CustomerProfile, Payment, Upload
from app.modules.orders.lock import lock_order
from app.modules.payments.schemas import MAX_PENDING_PAYMENTS, CustomerPaymentInput, PageParams
from app.modules.payments.service_common import PAYABLE, _exceeds, _load, _pending_sum, payment_json
from app.services.outbox import add_event
from app.services.storage import RECEIPT_PURPOSE

# ───────────── Mijoz ─────────────


async def report_for_order(db: AsyncSession, customer: AuthUser, order_id: str, body: CustomerPaymentInput) -> dict[str, Any]:
    """Buyurtma uchun o'tkazma — chek bilan, menejer tasdiqlaguncha PENDING"""
    async with transaction(db):
        order = await lock_order(db, order_id)
        if order.customer_id != customer.id:
            raise AppError.not_found("Buyurtma")
        if order.status not in PAYABLE:
            raise AppError(
                "ORDER_NOT_PAYABLE",
                "To'lov menejer shartlarni tasdiqlagandan keyin qilinadi",
                409,
                {"status": order.status},
            )
        if order.allowed_methods and body.method not in order.allowed_methods:
            raise AppError(
                "METHOD_NOT_ALLOWED",
                "Bu buyurtma uchun bunday to'lov usuli kelishilmagan",
                422,
                {"allowed": order.allowed_methods},
            )
        pending = await _pending_sum(db, Payment.order_id == order_id)
        due = order.grand_total - order.paid_total - pending
        if body.amount > due:
            raise _exceeds("Summa qoldiq qarzdan katta", due)
        return await _create_pending(db, customer, body, order_id)


async def report_for_debt(db: AsyncSession, customer: AuthUser, body: CustomerPaymentInput) -> dict[str, Any]:
    """Umumiy qarzga to'lov (buyurtmaga bog'lanmagan)"""
    async with transaction(db):
        profile = (await db.scalars(select(CustomerProfile).where(CustomerProfile.user_id == customer.id))).one()
        if body.method not in profile.allowed_payment_methods:
            raise AppError("METHOD_NOT_ALLOWED", "Bu to'lov usuli sizga ochilmagan", 422)
        pending = await _pending_sum(db, Payment.customer_id == customer.id, Payment.order_id.is_(None))
        due = profile.balance_cached - pending
        if body.amount > due:
            raise _exceeds("Summa qarzdan katta", due)
        return await _create_pending(db, customer, body, None)


async def _create_pending(
    db: AsyncSession, customer: AuthUser, body: CustomerPaymentInput, order_id: str | None
) -> dict[str, Any]:
    pending_count = await db.scalar(
        select(func.count()).select_from(Payment).where(Payment.customer_id == customer.id, Payment.status == "PENDING")
    )
    if (pending_count or 0) >= MAX_PENDING_PAYMENTS:
        raise AppError("TOO_MANY_PENDING", "Avvalgi to'lovlaringiz hali tekshirilmoqda", 429)
    receipt = (
        await db.execute(
            select(Upload.id, Payment.id.label("payment_id"))
            .outerjoin(Payment, Payment.receipt_upload_id == Upload.id)
            .where(Upload.id == body.receipt_upload_id, Upload.owner_id == customer.id, Upload.purpose == RECEIPT_PURPOSE)
            .limit(1)
        )
    ).first()
    if not receipt:
        raise AppError.not_found("Chek")
    if receipt.payment_id:
        raise AppError("RECEIPT_ALREADY_USED", "Bu chek boshqa to'lovga biriktirilgan", 409)

    payment = Payment(
        customer_id=customer.id,
        order_id=order_id,
        amount=body.amount,
        method=body.method,
        receipt_upload_id=receipt.id,
        comment=body.comment,
        created_by=customer.id,
    )
    db.add(payment)
    await db.flush()
    loaded = await _load(db, payment.id)
    assert loaded is not None
    await add_event(db, "payment.created", {"paymentId": payment.id})
    return payment_json(loaded)


async def create_driver_cash(db: AsyncSession, order: Any, amount: int, driver: AuthUser) -> Payment:
    """
    Haydovchi topshirishda olgan naqd pul. Kassaga topshirilganda menejer tasdiqlaydi —
    shungacha PENDING (pul haydovchida). Chaqiruvchi tranzaksiyasida, buyurtma qulflangan holda.
    order: .id, .customer_id, .grand_total, .paid_total
    """
    pending = await _pending_sum(db, Payment.order_id == order.id)
    due = order.grand_total - order.paid_total - pending
    if amount > due:
        raise _exceeds("Summa qoldiq qarzdan katta", due)
    payment = Payment(
        customer_id=order.customer_id,
        order_id=order.id,
        amount=amount,
        method="CASH",
        comment="Haydovchi topshirishda oldi",
        created_by=driver.id,
    )
    db.add(payment)
    await db.flush()
    await add_event(db, "payment.created", {"paymentId": payment.id})
    return payment


async def customer_payments(db: AsyncSession, customer_id: str, q: PageParams) -> dict[str, Any]:
    """include: order { id, number }"""
    rows = await db.scalars(
        select(Payment)
        .options(selectinload(Payment.order))
        .where(Payment.customer_id == customer_id)
        .order_by(Payment.created_at.desc())
        .offset((q.page - 1) * q.limit)
        .limit(q.limit)
        .execution_options(populate_existing=True)
    )
    items = [row(p, order=p.order and {"id": p.order.id, "number": p.order.number}) for p in rows]
    total = await db.scalar(select(func.count()).select_from(Payment).where(Payment.customer_id == customer_id)) or 0
    return {"items": items, "total": total, "page": q.page, "limit": q.limit}
