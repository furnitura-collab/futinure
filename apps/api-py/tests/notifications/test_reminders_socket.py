from datetime import date
from types import SimpleNamespace

import pytest
import socketio
from sqlalchemy import update

from app.models import Order
from app.modules.notifications import debt_reminders
from app.services import realtime as RT
from tests.notifications.helpers import NS, TERMS, drain, go, next_event, notifications, place_order, token
from tests.support import assert_matches, user_with_token

# ───── nasiya eslatmalari ─────


async def test_debt_reminders_2_days_before_on_day_every_3_days_after_once_per_day(s: SimpleNamespace):
    ctx = s.ctx
    o = await place_order(s)
    await ctx.db.execute(
        update(Order)
        .where(Order.id == o["id"])
        .values(
            status="COMPLETED", payment_terms="CREDIT", grand_total=4_620_000, paid_total=620_000, due_date=date(2026, 11, 10)
        )
    )
    await ctx.db.commit()

    assert await debt_reminders.run("2026-11-07") == 0
    assert await debt_reminders.run("2026-11-08") == 1
    assert await debt_reminders.run("2026-11-08") == 0
    assert await debt_reminders.run("2026-11-10") == 1
    assert await debt_reminders.run("2026-11-12") == 0
    assert await debt_reminders.run("2026-11-13") == 1

    items = await notifications(s)
    assert [n.type for n in items] == ["debt.soon", "debt.soon", "debt.overdue"]
    assert items[2].body == f"{o['number']}: 4 000 000 so'm qarz, muddat 2026-11-10 edi"


# ───── socket ─────


async def test_socket_without_token_rejected(s: SimpleNamespace, connect):
    with pytest.raises(socketio.exceptions.ConnectionError):
        await connect()
    with pytest.raises(socketio.exceptions.ConnectionError):
        await connect("buzilgan.token.x")


async def test_staff_get_new_order_realtime(s: SimpleNamespace, connect):
    staff = await connect(token(s.manager))
    got = next_event(staff, RT.ORDER_CREATED)
    o = await place_order(s)
    await drain()
    assert_matches(await got, {"id": o["id"], "number": o["number"], "grandTotal": 4_620_000})


async def test_order_room_only_own_order_status_changes_arrive(s: SimpleNamespace, connect):
    ctx = s.ctx
    o = await place_order(s)
    mine = await connect(token(s.customer.auth))
    stranger = await connect(token((await user_with_token(ctx, "CUSTOMER")).auth))

    assert await mine.call(RT.ORDER_SUBSCRIBE, {"orderId": o["id"]}, namespace=NS) == {"ok": True}
    assert await stranger.call(RT.ORDER_SUBSCRIBE, {"orderId": o["id"]}, namespace=NS) == {"ok": False, "error": "NOT_FOUND"}

    status = next_event(mine, RT.ORDER_STATUS_CHANGED)
    notif = next_event(mine, RT.NOTIFICATION)
    assert (await go(s, o["id"], {"to": "PREPARING", "terms": TERMS})).status_code == 200
    await drain()
    assert_matches(await status, {"orderId": o["id"], "from": "NEW", "to": "PREPARING"})
    assert_matches(await notif, {"type": "order.preparing"})
