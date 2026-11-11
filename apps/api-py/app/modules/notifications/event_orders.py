"""Hodisalar: buyurtma va yetkazish."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.format import format_money
from app.models import Order, OrderQuote
from app.modules.notifications.event_common import _MISSING, EntityNotFound, OutboxEnvelope, _link, _order, _role_of, _tg, _who
from app.modules.notifications.messages import DELIVERY_FAILED, READY_FOR_PICKUP, STATUS_TEXT, TEXTS
from app.modules.notifications.service import NotifyInput, Som, notify
from app.services import realtime as rt
from app.services.senders import escape_html

# ───── hodisalar ─────


async def _order_created(db: AsyncSession, e: OutboxEnvelope) -> None:
    x = await _order(db, e.payload["orderId"])
    o = x.o
    card = {
        "id": o.id,
        "number": o.number,
        "status": o.status,
        "grandTotal": o.grand_total,
        "customer": x.customer,
        "createdAt": o.created_at,
    }
    await rt.to_staff(rt.ORDER_CREATED, card)
    await _tg(
        f"🆕 <b>Yangi buyurtma {o.number}</b>\n{_who(x.customer)}\n{x.active_items} xil tovar, {format_money(o.grand_total)}\n"
        f"{'🏬 Olib ketadi' if o.delivery_type == 'PICKUP' else '🚚 Yetkazish'}\n{_link(o.id)}"
    )


async def _order_status_changed(db: AsyncSession, e: OutboxEnvelope) -> None:
    p = e.payload
    x = await _order(db, p["orderId"])
    o = x.o
    to, frm, comment = p.get("to"), p.get("from"), p.get("comment")
    data = {"orderId": o.id, "number": o.number, "from": frm, "to": to, "version": o.version}
    await rt.to_staff(rt.ORDER_STATUS_CHANGED, data)
    await rt.to_user(o.customer_id, rt.ORDER_STATUS_CHANGED, data)
    await rt.to_order(o.id, rt.ORDER_STATUS_CHANGED, data)

    failed = frm == "OUT_FOR_DELIVERY" and to == "READY"
    if failed:
        await _tg(f"🚫 <b>Yetkazilmadi: {o.number}</b>\n{_who(x.customer)}\n💬 {escape_html(comment or '')}\n{_link(o.id)}")

    actor_id = p.get("actorId", _MISSING)
    actor_role = await _role_of(db, actor_id) if isinstance(actor_id, str) and actor_id else None

    # Mijozning o'z harakati — unga emas, xodimlarga xabar
    if actor_role == "CUSTOMER":
        what = {
            "CONFIRMED": "✅ Mijoz taklifni qabul qildi",
            "NEW": "↩️ Mijoz taklifni rad etdi",
            "CANCELLED": "❌ Mijoz buyurtmani bekor qildi",
        }.get(to or "")
        if what:
            note = f"\n💬 {escape_html(comment)}" if comment else ""
            await _tg(f"{what}: <b>{o.number}</b>\n{_who(x.customer)}{note}\n{_link(o.id)}")
        return

    # QUOTED haqida mijozga "order.quote_created" xabar beradi; COMPLETED — to'lov xabari bilan
    if to in ("QUOTED", "COMPLETED"):
        return
    # NEW ga faqat taklif muddati o'tganda (tizim) qaytadi
    if to == "NEW" and actor_id is not None:
        return

    if failed:
        template = DELIVERY_FAILED
    elif to == "READY" and o.delivery_type == "PICKUP":
        template = READY_FOR_PICKUP
    else:
        template = STATUS_TEXT.get(to or "")
    if not template:
        return
    await notify(
        db,
        NotifyInput(
            event_id=e.id,
            user_id=o.customer_id,
            type="order.delivery_failed" if failed else f"order.{(to or '').lower()}",
            template=template,
            params={"number": o.number, "total": Som(o.grand_total), "comment": comment or ""},
            payload={"orderId": o.id},
        ),
    )


async def _order_quote_created(db: AsyncSession, e: OutboxEnvelope) -> None:
    x = await _order(db, e.payload["orderId"])
    o = x.o
    quote_id = e.payload["quoteId"]
    totals = await db.scalar(select(OrderQuote.totals).where(OrderQuote.id == quote_id))
    if totals is None:
        raise EntityNotFound("No OrderQuote found")
    data = {"orderId": o.id, "quoteId": quote_id}
    await rt.to_user(o.customer_id, rt.ORDER_QUOTE_CREATED, data)
    await rt.to_order(o.id, rt.ORDER_QUOTE_CREATED, data)
    await notify(
        db,
        NotifyInput(
            event_id=e.id,
            user_id=o.customer_id,
            type="order.quote",
            template=TEXTS["quote"],
            # Taklifdagi yangi summa (buyurtma summasi qabul qilinganda o'zgaradi)
            params={"number": o.number, "total": Som(totals["grandTotal"])},
            payload={"orderId": o.id, "quoteId": quote_id},
        ),
    )


async def _delivery_assigned(db: AsyncSession, e: OutboxEnvelope) -> None:
    p = e.payload
    o = await db.get(Order, p["orderId"])
    if not o:
        return
    driver_id, previous = p.get("driverId"), p.get("previousDriverId")
    data = {"orderId": o.id, "driverId": driver_id}
    await rt.to_staff(rt.DELIVERY_ASSIGNED, data)
    if previous:
        await rt.to_user(previous, rt.DELIVERY_ASSIGNED, data)
    if not driver_id:
        return
    await rt.to_user(driver_id, rt.DELIVERY_ASSIGNED, data)
    snap = o.address_snapshot
    address = (snap.get("addressText") if isinstance(snap, dict) else None) or ""
    await notify(
        db,
        NotifyInput(
            # Bir buyurtma bir haydovchiga qayta biriktirilsa ham har safar xabar (hodisa id'si bo'yicha)
            event_id=e.id,
            user_id=driver_id,
            type="delivery.assigned",
            template=TEXTS["deliveryAssigned"],
            params={"number": o.number, "address": address},
            payload={"orderId": o.id},
        ),
    )
