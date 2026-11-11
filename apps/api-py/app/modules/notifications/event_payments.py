"""Hodisalar: to'lovlar."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.domain.format import format_money
from app.modules.notifications.event_common import OutboxEnvelope, _payment, _payment_updated, _tg, _who
from app.modules.notifications.messages import TEXTS
from app.modules.notifications.service import NotifyInput, Som, notify
from app.services import realtime as rt


async def _payment_created(db: AsyncSession, e: OutboxEnvelope) -> None:
    x = await _payment(db, e.payload["paymentId"])
    p = x.p
    await rt.to_staff(rt.PAYMENT_CREATED, x.json())
    head = "💵 <b>Haydovchi naqd oldi" if p.method == "CASH" else "💳 <b>Yangi chek"
    target = f"Buyurtma {x.order['number']}" if x.order else "Umumiy qarzga"
    await _tg(
        f"{head}: {format_money(p.amount)}</b>\n{_who(x.customer)}\n{target}\n{get_settings().ADMIN_URL}/payments?status=PENDING"
    )


async def _payment_confirmed(db: AsyncSession, e: OutboxEnvelope) -> None:
    x = await _payment(db, e.payload["paymentId"])
    p = x.p
    await _payment_updated(x)
    await notify(
        db,
        NotifyInput(
            event_id=e.id,
            user_id=p.customer_id,
            type="payment.confirmed",
            template=TEXTS["paymentConfirmed"],
            params={"amount": Som(p.amount), "order": f" ({x.order['number']})" if x.order else ""},
            payload={"paymentId": p.id, "orderId": p.order_id},
        ),
    )


async def _payment_rejected(db: AsyncSession, e: OutboxEnvelope) -> None:
    x = await _payment(db, e.payload["paymentId"])
    p = x.p
    await _payment_updated(x)
    await notify(
        db,
        NotifyInput(
            event_id=e.id,
            user_id=p.customer_id,
            type="payment.rejected",
            template=TEXTS["paymentRejected"],
            params={"amount": Som(p.amount), "reason": p.reject_reason or ""},
            payload={"paymentId": p.id, "orderId": p.order_id},
        ),
    )
