"""
Transactional outbox. Hodisa biznes o'zgarishi bilan BIR tranzaksiyada yoziladi:
tranzaksiya bekor bo'lsa — xabar ham ketmaydi; server yiqilsa — xabar yo'qolmaydi.

Hodisa turlari va ma'lumoti (minimal — handler kerakli narsani bazadan o'qiydi):
  order.created          { orderId }
  order.status_changed   { orderId, from, to, actorId, comment }
  order.quote_created    { orderId, quoteId }
  payment.created        { paymentId }
  payment.confirmed      { paymentId }
  payment.rejected       { paymentId }
  chat.message           { messageId }
  chat.read              { orderId, readerRole: CUSTOMER | STAFF }
  delivery.assigned      { orderId, driverId, previousDriverId }
"""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OutboxEvent


async def add_event(db: AsyncSession, type: str, payload: dict[str, Any]) -> None:
    db.add(OutboxEvent(type=type, payload=payload))
    await db.flush()
