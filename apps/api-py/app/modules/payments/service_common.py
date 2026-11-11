"""To'lovlar: umumiy yordamchilar va tasdiqlangan to'lovni qo'llash."""

from typing import Any

from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import row
from app.models import Order, Payment, User, utcnow
from app.modules.orders import workflow
from app.modules.orders.lock import lock_order
from app.services.audit import audit
from app.services.ledger import post_ledger
from app.services.outbox import add_event

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
