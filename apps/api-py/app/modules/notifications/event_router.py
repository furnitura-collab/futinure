"""
Hodisa → kanallar:
  real-time (admin panel va ochiq ilova), bildirishnoma + push (mijoz), Telegram (xodimlar guruhi).
Takroriy chaqiruvga chidamli: bildirishnoma (eventId, userId) bo'yicha bir marta; real-time takrori zararsiz.
"""

from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notifications.event_chat import _chat_message, _chat_read
from app.modules.notifications.event_common import EntityNotFound, OutboxEnvelope
from app.modules.notifications.event_orders import _delivery_assigned, _order_created, _order_status_changed, _order_terms_set
from app.modules.notifications.event_payments import _payment_confirmed, _payment_created, _payment_rejected

__all__ = ["HANDLERS", "handle", "OutboxEnvelope", "EntityNotFound"]


HANDLERS: dict[str, Callable[[AsyncSession, OutboxEnvelope], Awaitable[None]]] = {
    "order.created": _order_created,
    "order.status_changed": _order_status_changed,
    "order.terms_set": _order_terms_set,
    "payment.created": _payment_created,
    "payment.confirmed": _payment_confirmed,
    "payment.rejected": _payment_rejected,
    "chat.message": _chat_message,
    "delivery.assigned": _delivery_assigned,
    "chat.read": _chat_read,
}


async def handle(db: AsyncSession, event: OutboxEnvelope) -> None:
    """OutboxHandler. Noma'lum tur — xato (qayta urinishga qoladi, NestJS'dagi kabi)"""
    handler = HANDLERS.get(event.type)
    if handler is None:
        raise TypeError(f"handler is not a function: {event.type}")
    await handler(db, event)
