"""
Yangi buyurtmani qabul qilish (NEW → PREPARING) va shartlarni oldindan saqlash.

    await acceptance.accept(db, locked_order, body, actor, assign)   # workflow.apply ichida
    await acceptance.save_terms(db, order_id, body, actor)           # o'z tranzaksiyasida; status o'zgarmaydi

Oldindan to'lovli buyurtma: menejer shartlarni saqlaydi → mijoz avansni to'laydi → menejer yig'ishga beradi.
Qolganlari bitta qadamda: shartlar bilan darhol yig'ishga.
"""

from typing import Any

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.db import transaction
from app.domain.pricing import compute_order_totals
from app.models import Order
from app.modules.orders import inventory
from app.modules.orders.lock import LockedOrder, conflict, lock_order
from app.modules.orders.schemas import OrderTermsInput, SetTermsInput, TransitionInput
from app.modules.orders.state_machine import ensure_allowed, opt, transition
from app.modules.orders.terms import terms_data, validate_terms
from app.services.audit import audit
from app.services.outbox import add_event


def _terms_columns(order: LockedOrder, body_terms: OrderTermsInput) -> dict[str, Any]:
    """Shartlar tekshiriladi va buyurtma ustunlariga aylantiriladi (summalar qayta hisoblanadi)"""
    terms = body_terms.terms()
    totals = compute_order_totals(
        [(i.qty, i.unit_price) for i in order.items],
        services_total=order.services_total,
        delivery_fee=terms["deliveryFee"],
        discount_total=terms["discountTotal"],
    ).as_dict()
    validate_terms(terms, totals, order.customer_profile)
    return terms_data(terms, totals)


def _check_payments(order: LockedOrder, columns: dict[str, Any], body: TransitionInput, actor: AuthUser) -> None:
    """Yig'ishdan oldin: avans to'langanmi, nasiya limitdan oshmaydimi (yangi shartlar bo'lsa — shular bo'yicha)"""
    terms = columns.get("payment_terms", order.payment_terms)
    grand_total = columns.get("grand_total", order.grand_total)
    advance = columns.get("advance_amount", order.advance_amount)
    required = grand_total if terms == "PREPAID" else advance if terms == "ADVANCE" else 0
    has_comment = bool((body.comment or "").strip())
    if order.paid_total < required:
        can_override = body.override_advance and actor.role == "SUPER_ADMIN" and has_comment
        if not can_override:
            raise AppError("ADVANCE_NOT_PAID", "Avans hali to'lanmagan", 409, {"required": required, "paid": order.paid_total})

    if terms == "CREDIT":
        profile = order.customer_profile
        assert profile is not None
        exposure = profile.balance_cached + grand_total
        if exposure > profile.credit_limit and not (body.override_credit_limit and has_comment):
            raise AppError(
                "CREDIT_LIMIT_EXCEEDED",
                "Mijoz kredit limitidan oshadi. Izoh bilan tasdiqlang",
                409,
                {"creditLimit": profile.credit_limit, "balance": profile.balance_cached, "exposure": exposure},
            )


async def accept(db: AsyncSession, order: LockedOrder, body: TransitionInput, actor: AuthUser, assign: dict[str, Any]) -> None:
    """NEW → PREPARING: shartlar (yangi yoki oldin saqlangan), to'lov tekshiruvi, rezerv"""
    ensure_allowed(order, "PREPARING", actor, body.comment)
    if body.terms:
        columns = _terms_columns(order, body.terms)
    elif order.payment_terms:
        columns = {}
    else:
        raise AppError("TERMS_REQUIRED", "To'lov shartlarini belgilang", 422)
    _check_payments(order, columns, body, actor)
    await transition(db, order, "PREPARING", actor, comment=opt(body.comment), data={**columns, **assign})
    await inventory.reserve(db, order.id, actor.id)


async def save_terms(db: AsyncSession, order_id: str, body: SetTermsInput, actor: AuthUser) -> dict[str, Any]:
    """Yangi buyurtmaga shartlarni yozadi (status o'zgarmaydi); mijozga to'lov haqida xabar boradi"""
    async with transaction(db):
        order = await lock_order(db, order_id, body.expected_version)
        if order.status != "NEW":
            raise AppError(
                "TERMS_ONLY_NEW", "Shartlarni faqat yangi buyurtmada o'zgartirish mumkin", 409, {"status": order.status}
            )
        columns = _terms_columns(order, body.terms)
        if not order.manager_id and actor.role in ("MANAGER", "SUPER_ADMIN"):
            columns["manager_id"] = actor.id
        result = await db.execute(
            update(Order)
            .where(Order.id == order.id, Order.version == order.version)
            .values(**columns, version=Order.version + 1)
            .execution_options(synchronize_session=False)
        )
        if result.rowcount == 0:  # type: ignore[attr-defined]
            raise conflict()
        after = {"paymentTerms": columns["payment_terms"]}
        await audit(db, actor_id=actor.id, entity="order", entity_id=order.id, action="terms:set", after=after)
        await add_event(db, "order.terms_set", {"orderId": order.id})
    return {"ok": True, "version": order.version + 1}
