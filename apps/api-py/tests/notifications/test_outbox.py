from types import SimpleNamespace

from sqlalchemy import select, text, update

from app.models import Order, OutboxEvent, utcnow
from tests.notifications.helpers import TERMS, drain, go, notifications, place_order

# ───── outbox ─────


async def test_new_order_event_written_and_sent_to_telegram(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    events = await ctx.all(select(OutboxEvent))
    assert [e.type for e in events] == ["order.created"]
    assert await drain() == 1
    assert len(ctx.telegram.messages) == 1
    assert o["number"] in ctx.telegram.messages[0]
    assert "4 620 000 so'm" in ctx.telegram.messages[0]
    assert (await ctx.first(select(OutboxEvent))).processed_at is not None


async def test_rolled_back_transaction_leaves_no_event(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s, 130)  # omborda 120
    await drain()
    assert (await go(s, o["id"], {"to": "CONFIRMED", "terms": TERMS})).status_code == 409
    assert await ctx.count(OutboxEvent, OutboxEvent.processed_at.is_(None)) == 0


async def test_handler_error_retried_later(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    # Hodisa qayta ishlanguncha buyurtma yo'qolsa — handler yiqiladi
    await ctx.db.execute(update(Order).where(Order.id == o["id"]).values(number=o["number"]))
    await ctx.db.execute(text("""UPDATE outbox_events SET payload = '{"orderId":"01900000-0000-7000-8000-000000000000"}'"""))
    await ctx.db.commit()
    await drain()
    e = await ctx.first(select(OutboxEvent))
    assert (e.attempts, e.processed_at) == (1, None)
    assert e.last_error
    assert e.next_attempt_at > utcnow()


async def test_reprocessing_gives_no_duplicate_notification_or_push(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    assert (await go(s, o["id"], {"to": "CONFIRMED", "terms": TERMS})).status_code == 200
    await drain()
    assert len(await notifications(s)) == 1
    assert len(ctx.push.sent) == 1

    await ctx.db.execute(update(OutboxEvent).values(processed_at=None))
    await ctx.db.commit()
    await drain()
    assert len(await notifications(s)) == 1
    assert len(ctx.push.sent) == 1
