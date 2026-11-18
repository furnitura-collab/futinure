from types import SimpleNamespace

import pytest
import socketio

from app.services import realtime as RT
from tests.notifications.helpers import NS, TERMS, drain, go, next_event, place_order, token
from tests.support import assert_matches, user_with_token

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
