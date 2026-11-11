"""
Buyurtma statusini o'zgartirishning YAGONA joyi
(docs/02-state-machine.md). To'g'ridan-to'g'ri `order.status = ...` taqiqlanadi.

    from app.modules.orders.state_machine import transition, UNSET

    new_version = await transition(db, order, "PREPARING", actor, comment=..., data={"manager_id": actor.id})

Faqat umumiy qism: qoida tekshiruvi, optimistic lock, tarix, audit, outbox.
O'tishga xos yon ta'sirlar (rezerv, ledger) chaqiruvchi tomonidan o'sha tranzaksiyada qilinadi.
"""

from typing import Any, Protocol

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.domain.state_machine import check_transition
from app.models import Order, OrderStatusHistory, utcnow
from app.modules.orders.lock import conflict
from app.services.audit import audit
from app.services.outbox import add_event


class _Unset:
    def __repr__(self) -> str:
        return "UNSET"


# TS'dagi `undefined`: audit `after`'da comment kaliti umuman bo'lmaydi
UNSET: Any = _Unset()


class TransitionTarget(Protocol):
    id: str
    status: str
    version: int
    delivery_type: str


REASON_MESSAGES = {
    "NO_SUCH_TRANSITION": "Bu statusdan bunday o'tish mumkin emas",
    "FORBIDDEN_ROLE": "Bu amal uchun ruxsat yo'q",
    "WRONG_DELIVERY_TYPE": "Yetkazish turiga mos emas",
    "COMMENT_REQUIRED": "Sabab yoki izoh majburiy",
}


def opt(value: Any) -> Any:
    """Zod .optional() maydon: None (yuborilmagan) → UNSET"""
    return UNSET if value is None else value


def ensure_allowed(order: TransitionTarget, to: str, actor: AuthUser | None, comment: str | None) -> None:
    """Qoida tekshiruvi (kim, qayerdan, qayerga). Yon ta'sirli tekshiruvlardan oldin ham chaqiriladi — ruxsat yo'q bo'lsa 403"""
    check = check_transition(
        from_status=order.status,
        to=to,
        role=actor.role if actor else None,
        delivery_type=order.delivery_type,
        comment=comment,
    )
    if not check.ok:
        reason = str(check.reason)
        status = 403 if reason == "FORBIDDEN_ROLE" else 409
        raise AppError(f"TRANSITION_{reason}", REASON_MESSAGES[reason], status, {"from": order.status, "to": to})


async def transition(
    db: AsyncSession,
    order: TransitionTarget,
    to: str,
    actor: AuthUser | None,
    *,
    comment: str | None = UNSET,
    data: dict[str, Any] | None = None,
) -> int:
    """
    order — id/status/version/delivery_type bor obyekt (LockedOrder, Order).
    actor None — tizim (cron, avtomatik o'tish). data — Order ustunlari (snake_case) qo'shimcha yangilash.
    Qaytaradi: yangi versiya. Xato: TRANSITION_* (403/409), ORDER_CONFLICT (409).
    """
    text_comment = None if comment is UNSET else comment
    ensure_allowed(order, to, actor, text_comment)

    now = utcnow()
    timestamps: dict[str, Any] = {}
    # Menejer qabul qilgan vaqt (yig'ishga berilganda)
    if to == "PREPARING" and order.status == "NEW":
        timestamps["confirmed_at"] = now
    if to == "DELIVERED":
        timestamps["delivered_at"] = now
    if to == "COMPLETED":
        timestamps["completed_at"] = now
    if to == "CANCELLED":
        timestamps.update(cancelled_at=now, cancel_reason=text_comment, cancelled_by=actor.id if actor else None)

    # Optimistic lock: boshqa birov orada o'zgartirgan bo'lsa — 409
    result = await db.execute(
        update(Order)
        .where(Order.id == order.id, Order.version == order.version, Order.status == order.status)
        .values(**(data or {}), **timestamps, status=to, version=Order.version + 1)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:  # type: ignore[attr-defined]
        raise conflict()

    actor_id = actor.id if actor else None
    db.add(OrderStatusHistory(order_id=order.id, from_status=order.status, to_status=to, actor_id=actor_id, comment=text_comment))
    await db.flush()
    await audit(
        db,
        actor_id=actor_id,
        entity="order",
        entity_id=order.id,
        action=f"status:{order.status}>{to}",
        after={} if comment is UNSET else {"comment": comment},
    )
    # Har o'tish xabar beradi (mijozga push, adminga real-time) — shu tranzaksiyada
    await add_event(
        db,
        "order.status_changed",
        {"orderId": order.id, "from": order.status, "to": to, "actorId": actor_id, "comment": text_comment},
    )
    return order.version + 1
