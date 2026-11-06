"""
Outbox'dan hodisalarni o'qib, handler'ga beradi.
- FOR UPDATE SKIP LOCKED: bir nechta API nusxasi bir hodisani ikki marta olmaydi.
- Xato bo'lsa — eksponensial kechikish bilan qayta urinish, MAX_ATTEMPTS dan keyin to'xtaydi.
- Kamida bir marta (at-least-once): handler'lar takroriy chaqiruvga chidamli bo'lishi kerak.
Testlarda o'chiq — testlar drain()'ni to'g'ridan-to'g'ri chaqiradi.
"""

import asyncio
import logging
from datetime import timedelta

from sqlalchemy import select

from app.db import standalone_session, transaction
from app.models import OutboxEvent, utcnow
from app.modules.notifications.event_router import OutboxEnvelope, handle

log = logging.getLogger("OutboxDispatcher")

POLL_SECONDS = 0.5
BATCH = 50
MAX_ATTEMPTS = 8


async def drain() -> int:
    """Navbatdagi barcha hodisalarni qayta ishlaydi. Qaytaradi: qayta ishlanganlar soni"""
    total = 0
    while True:
        n = await _process_batch()
        total += n
        if n < BATCH:
            return total


async def _process_batch() -> int:
    async with standalone_session() as db, transaction(db):
        # Vaqtni ilova soati bilan solishtiramiz: next_attempt_at ham ilovada yoziladi,
        # DB soati bir necha ms orqada bo'lsa yangi hodisa o'tkazib yuborilmasin
        rows = list(
            await db.scalars(
                select(OutboxEvent)
                .where(OutboxEvent.processed_at.is_(None), OutboxEvent.next_attempt_at <= utcnow())
                .order_by(OutboxEvent.created_at, OutboxEvent.id)
                .limit(BATCH)
                .with_for_update(skip_locked=True)
            )
        )
        for ev in rows:
            event = OutboxEnvelope(id=ev.id, type=ev.type, payload=ev.payload, created_at=ev.created_at)
            try:
                # Handler o'z sessiyasida: bildirishnomalar darhol yoziladi (NestJS'da ham this.prisma, tx emas)
                async with standalone_session() as hdb:
                    await handle(hdb, event)
                ev.processed_at = utcnow()
                ev.attempts = ev.attempts + 1
            except Exception as e:
                attempts = ev.attempts + 1
                give_up = attempts >= MAX_ATTEMPTS
                log.exception("Hodisa %s %s (%s-urinish)%s", ev.type, ev.id, attempts, " — to'xtatildi" if give_up else "")
                ev.attempts = attempts
                ev.last_error = (str(e) or repr(e))[:1000]
                ev.next_attempt_at = utcnow() + timedelta(seconds=2**attempts)
                if give_up:
                    ev.processed_at = utcnow()
            await db.flush()
        return len(rows)


async def run_forever() -> None:
    """Fon vazifasi: har 0.5 soniyada navbatni bo'shatadi"""
    while True:
        try:
            await drain()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Outbox xatosi")
        await asyncio.sleep(POLL_SECONDS)
