"""Takliflar: menejer taklif yaratadi; taklif ko'rinishi."""

from datetime import timedelta
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.db import transaction
from app.domain.pricing import compute_order_totals
from app.models import Order, OrderQuote, Setting, utcnow
from app.modules.orders.lock import lock_order
from app.modules.orders.quotes_lines import _build_lines
from app.modules.orders.schemas import QuoteInput
from app.modules.orders.state_machine import opt, transition
from app.modules.orders.terms import validate_terms
from app.services.audit import audit
from app.services.outbox import add_event

DEFAULT_TTL_HOURS = 24

# changes JSON: { lines: QuoteLine[], orderVersion: taklifdan keyingi buyurtma versiyasi, terms }


# ───────────── Menejer: taklif yaratish ─────────────


async def create(db: AsyncSession, order_id: str, body: QuoteInput, actor: AuthUser) -> dict[str, Any]:
    async with transaction(db):
        order = await lock_order(db, order_id, body.expected_version)
        if order.status not in ("NEW", "QUOTED"):
            raise AppError("QUOTE_NOT_ALLOWED", "Taklif faqat yangi buyurtmaga yuboriladi", 409, {"status": order.status})

        lines, warnings = await _build_lines(db, order, body)
        totals = compute_order_totals(
            [(ln["qty"], ln["unitPrice"]) for ln in lines if ln["action"] != "REMOVE"],
            services_total=order.services_total,
            delivery_fee=body.delivery_fee,
            discount_total=body.discount_total,
        ).as_dict()
        terms = body.terms()
        validate_terms(terms, totals, order.customer_profile)

        ttl_hours = body.expires_in_hours if body.expires_in_hours is not None else await _ttl_hours(db)
        last = await db.scalar(
            select(OrderQuote.version).where(OrderQuote.order_id == order_id).order_by(OrderQuote.version.desc()).limit(1)
        )
        await db.execute(
            update(OrderQuote)
            .where(OrderQuote.order_id == order_id, OrderQuote.status == "PENDING")
            .values(status="SUPERSEDED")
            .execution_options(synchronize_session=False)
        )

        order_version = order.version + 1
        quote = OrderQuote(
            order_id=order_id,
            version=(last or 0) + 1,
            created_by=actor.id,
            changes={"lines": lines, "orderVersion": order_version, "terms": terms},
            totals=totals,
            payment_terms=terms["paymentTerms"],
            advance_amount=terms["advanceAmount"],
            allowed_methods=terms["allowedMethods"],
            manager_note=body.note,
            status="PENDING",
            expires_at=utcnow() + timedelta(hours=ttl_hours),
        )
        db.add(quote)
        await db.flush()
        # Prisma kabi: JSON maydonlar bazadan (jsonb kalit tartibida) qaytadi
        await db.refresh(quote)

        data: dict[str, Any] = {"current_quote_id": quote.id}
        if not order.manager_id:
            data["manager_id"] = actor.id
        if order.status == "NEW":
            await transition(db, order, "QUOTED", actor, comment=opt(body.note), data=data)
        else:
            # Taklif yangilandi — status o'zgarmaydi, lekin versiya oshadi
            await db.execute(
                update(Order)
                .where(Order.id == order_id)
                .values(**data, version=Order.version + 1)
                .execution_options(synchronize_session=False)
            )
            await audit(
                db,
                actor_id=actor.id,
                entity="order",
                entity_id=order_id,
                action="quote_revised",
                after={"version": quote.version},
            )
        await add_event(db, "order.quote_created", {"orderId": order_id, "quoteId": quote.id})
        return {"quote": present_quote(quote), "warnings": warnings}


async def _ttl_hours(db: AsyncSession) -> int | float:
    value = await db.scalar(select(Setting.value).where(Setting.key == "quote.ttl_hours"))
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else DEFAULT_TTL_HOURS


def present_quote(q: OrderQuote) -> dict[str, Any]:
    """Taklif — mijoz va admin uchun bir xil ko'rinish"""
    changes = q.changes or {}
    return {
        "id": q.id,
        "version": q.version,
        "status": q.status,
        "lines": changes.get("lines"),
        "totals": q.totals,
        "terms": changes.get("terms"),
        "paymentTerms": q.payment_terms,
        "advanceAmount": q.advance_amount,
        "allowedMethods": q.allowed_methods,
        "managerNote": q.manager_note,
        "customerComment": q.customer_comment,
        "expiresAt": q.expires_at,
        "respondedAt": q.responded_at,
        "createdAt": q.created_at,
    }
