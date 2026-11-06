"""
To'lovlar.

    from app.modules.payments import service as payments

    await payments.report_for_order(db, customer, order_id, body)    # mijoz: chek bilan, PENDING
    await payments.record(db, body, actor)                            # menejer: darhol CONFIRMED
    async with transaction(db):
        await payments.create_driver_cash(db, order, amount, driver)  # haydovchi topshirishda olgan naqd
"""

from typing import Any

from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import row
from app.db import transaction
from app.models import CustomerProfile, Order, Payment, Setting, Upload, User, utcnow
from app.modules.orders import workflow
from app.modules.orders.lock import lock_order
from app.modules.payments.schemas import (
    MAX_PENDING_PAYMENTS,
    AdminPaymentInput,
    CustomerPaymentInput,
    PageParams,
    PaymentListQuery,
)
from app.services.audit import audit
from app.services.ledger import post_ledger
from app.services.outbox import add_event
from app.services.storage import RECEIPT_PURPOSE

# Shu statuslarda buyurtmaga to'lov qabul qilinadi (taklif kelishilgandan keyin)
PAYABLE = ("CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED")

METHOD_LABEL = {
    "CASH": "naqd",
    "CARD_TRANSFER": "karta o'tkazmasi",
    "CLICK": "Click",
    "PAYME": "Payme",
    "BANK_TRANSFER": "bank o'tkazmasi",
}

# paymentInclude: order { id, number, grandTotal, paidTotal }, customer { id, phone, fullName, customerProfile { companyName } },
# receipt { id, mimeType, size }
_INCLUDE = (
    selectinload(Payment.order),
    selectinload(Payment.customer).selectinload(User.customer_profile),
    selectinload(Payment.receipt),
)


def payment_json(p: Payment) -> dict[str, Any]:
    o, c, r = p.order, p.customer, p.receipt
    profile = c.customer_profile
    return row(
        p,
        order=o and {"id": o.id, "number": o.number, "grandTotal": o.grand_total, "paidTotal": o.paid_total},
        customer={
            "id": c.id,
            "phone": c.phone,
            "fullName": c.full_name,
            "customerProfile": profile and {"companyName": profile.company_name},
        },
        receipt=r and {"id": r.id, "mimeType": r.mime_type, "size": r.size},
    )


async def _load(db: AsyncSession, payment_id: str) -> Payment | None:
    return await db.scalar(
        select(Payment).options(*_INCLUDE).where(Payment.id == payment_id).execution_options(populate_existing=True)
    )


def _exceeds(message: str, due: int) -> AppError:
    return AppError("AMOUNT_EXCEEDS_DUE", message, 422, {"due": due if due > 0 else 0})


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
            if order.status not in PAYABLE:
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


# ───────────── Ichki ─────────────


async def _apply_confirmed(db: AsyncSession, p: Payment, actor: AuthUser) -> None:
    """
    Tasdiqlangan to'lovning ta'siri (bitta tranzaksiyada):
    ledger CREDIT, buyurtmaning paid_total, kerak bo'lsa buyurtmani yakunlash.
    Buyurtmasiz to'lov eng eski to'lanmagan buyurtmalarga taqsimlanadi (FIFO).
    """
    number = await db.scalar(select(Order.number).where(Order.id == p.order_id)) if p.order_id else None
    await post_ledger(
        db,
        customer_id=p.customer_id,
        type="CREDIT",
        amount=-p.amount,
        order_id=p.order_id,
        payment_id=p.id,
        description=f"To'lov ({METHOD_LABEL[p.method]})" + (f" — {number}" if number else ""),
        created_by=actor.id,
    )

    allocations: list[dict[str, Any]] = []
    if p.order_id:
        await lock_order(db, p.order_id)
        allocations.append({"orderId": p.order_id, "amount": p.amount})
    else:
        left = p.amount
        debts = (
            await db.execute(
                text("""
        SELECT id, grand_total - paid_total AS due FROM orders
        WHERE customer_id = CAST(:customer AS uuid) AND status IN ('DELIVERED', 'COMPLETED') AND grand_total > paid_total
        ORDER BY delivered_at ASC, id ASC FOR UPDATE"""),
                {"customer": p.customer_id},
            )
        ).all()
        for d in debts:
            if left <= 0:
                break
            amount = min(int(d.due), left)
            allocations.append({"orderId": str(d.id), "amount": amount})
            left -= amount
        # Ortib qolgani mijoz foydasiga balansda qoladi (ledger'da allaqachon)

    for a in allocations:
        await db.execute(
            update(Order)
            .where(Order.id == a["orderId"])
            .values(paid_total=Order.paid_total + a["amount"], updated_at=utcnow())
            .execution_options(synchronize_session=False)
        )
        await workflow.complete_if_settled(db, a["orderId"])
    await audit(
        db,
        actor_id=actor.id,
        entity="payment",
        entity_id=p.id,
        action="confirm",
        after={"amount": p.amount, "allocations": allocations},
    )
    await add_event(db, "payment.confirmed", {"paymentId": p.id})


async def _pending_sum(db: AsyncSession, *conds: Any) -> int:
    total = await db.scalar(select(func.sum(Payment.amount)).where(*conds, Payment.status == "PENDING"))
    return int(total or 0)


async def _not_pending(db: AsyncSession, payment_id: str) -> AppError:
    status = await db.scalar(select(Payment.status).where(Payment.id == payment_id))
    if status is None:
        return AppError.not_found("To'lov")
    return AppError("PAYMENT_NOT_PENDING", "To'lov allaqachon ko'rib chiqilgan", 409, {"status": status})
