"""
Takliflar (QUOTED).

    from app.modules.orders import quotes
    await quotes.create(db, order_id, body, actor)      # menejer: {"quote", "warnings"}
    await quotes.accept(db, customer, order_id, quote_id)
    await quotes.reject(db, customer, order_id, quote_id, comment)
    await quotes.expire_due()                           # tizim: muddati o'tganlar → NEW
    quotes.present_quote(q)                             # mijoz va admin uchun bir xil ko'rinish
"""

import logging
from datetime import datetime

from sqlalchemy import select, update

from app.db import standalone_session, transaction
from app.models import OrderQuote, utcnow
from app.modules.orders.lock import lock_order
from app.modules.orders.quotes_create import DEFAULT_TTL_HOURS, create, present_quote
from app.modules.orders.quotes_respond import accept, recalc_weight, reject
from app.modules.orders.state_machine import transition

__all__ = ["log", "expire_due", "DEFAULT_TTL_HOURS", "create", "present_quote", "accept", "reject", "recalc_weight"]


log = logging.getLogger("OrderQuotesService")


# ───────────── Tizim: muddati o'tgan takliflar ─────────────


async def expire_due(now: datetime | None = None) -> int:
    """Qaytaradi: qancha taklif muddati o'tgan deb belgilandi"""
    now = now or utcnow()
    async with standalone_session() as db:
        due = (
            await db.execute(
                select(OrderQuote.id, OrderQuote.order_id)
                .where(OrderQuote.status == "PENDING", OrderQuote.expires_at < now)
                .limit(100)
            )
        ).all()
    for q in due:
        try:
            async with standalone_session() as db, transaction(db):
                order = await lock_order(db, q.order_id)
                result = await db.execute(
                    update(OrderQuote)
                    .where(OrderQuote.id == q.id, OrderQuote.status == "PENDING")
                    .values(status="EXPIRED")
                    .execution_options(synchronize_session=False)
                )
                if result.rowcount and order.status == "QUOTED" and order.current_quote_id == q.id:  # type: ignore[attr-defined]
                    await transition(db, order, "NEW", None, comment="Taklif muddati o'tdi", data={"current_quote_id": None})
        except Exception:
            log.exception("Taklif %s muddatini yopib bo'lmadi", q.id)
    return len(due)
