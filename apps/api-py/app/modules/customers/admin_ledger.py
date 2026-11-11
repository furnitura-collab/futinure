"""Admin: mijoz hisobini qo'lda tuzatish, pul qaytarish, debitorlik."""

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.db import transaction
from app.domain.dates import business_date, to_date
from app.models import LedgerEntry
from app.modules.customers.credit_orders import UNPAID_CREDIT_ORDER_SQL
from app.modules.customers.schemas import LedgerAdjustInput, RefundInput
from app.services.audit import audit
from app.services.ledger import post_ledger


async def adjust(db: AsyncSession, customer_id: str, body: LedgerAdjustInput, actor: AuthUser) -> LedgerEntry | None:
    """Qo'lda tuzatish (masalan, eski qarzni tizimga kiritish). Faqat super admin. Javob: ledger yozuvi"""
    async with transaction(db):
        entry = await post_ledger(
            db,
            customer_id=customer_id,
            type="ADJUSTMENT",
            amount=body.amount,
            description=body.description,
            created_by=actor.id,
        )
        await audit(
            db,
            actor_id=actor.id,
            entity="customer",
            entity_id=customer_id,
            action="ledger_adjust",
            after=body.model_dump(by_alias=True),
        )
    return entry


async def refund(db: AsyncSession, customer_id: str, body: RefundInput, actor: AuthUser) -> LedgerEntry | None:
    """
    Mijoz haqdor bo'lsa (masalan, bekor qilingan buyurtma avansi) pulni qaytarish.
    Summa haqdorlikdan katta → 422 REFUND_EXCEEDS_CREDIT { available }.
    """
    async with transaction(db):
        bal = (
            await db.execute(
                text("SELECT balance_cached FROM customer_profiles WHERE user_id = CAST(:id AS uuid) FOR UPDATE"),
                {"id": customer_id},
            )
        ).scalar_one_or_none()
        if bal is None:
            raise AppError.not_found("Mijoz")
        credit = -int(bal)
        if body.amount > credit:
            raise AppError(
                "REFUND_EXCEEDS_CREDIT",
                "Qaytariladigan summa mijoz haqidan katta",
                422,
                {"available": credit if credit > 0 else 0},
            )
        entry = await post_ledger(
            db,
            customer_id=customer_id,
            type="REFUND",
            amount=body.amount,
            description=f"Pul qaytarildi ({body.method}): {body.description}",
            created_by=actor.id,
        )
        await audit(
            db, actor_id=actor.id, entity="customer", entity_id=customer_id, action="refund", after=body.model_dump(by_alias=True)
        )
    return entry


async def receivables(db: AsyncSession) -> dict[str, Any]:
    """Debitorlik hisoboti: kim qancha qarz, qanchasi muddati o'tgan. Kalitlar snake_case (xom SQL, NestJS kabi)"""
    result = await db.execute(
        text(f"""
      SELECT u.id AS customer_id, u.full_name, u.phone, cp.company_name, cp.balance_cached AS balance, cp.credit_limit,
             od.overdue, od.oldest_due
      FROM customer_profiles cp
      JOIN users u ON u.id = cp.user_id
      LEFT JOIN LATERAL (
        SELECT SUM(grand_total - paid_total)::bigint AS overdue, MIN(due_date) AS oldest_due
        FROM orders
        WHERE customer_id = cp.user_id AND {UNPAID_CREDIT_ORDER_SQL} AND due_date < CAST(:today AS date)
      ) od ON true
      WHERE cp.balance_cached > 0
      ORDER BY od.overdue DESC NULLS LAST, cp.balance_cached DESC
      LIMIT 500"""),
        {"today": to_date(business_date())},
    )
    items = [{**dict(r), "customer_id": str(r["customer_id"]), "overdue": int(r["overdue"] or 0)} for r in result.mappings()]
    return {
        "totalReceivable": sum(int(r["balance"]) for r in items),
        "totalOverdue": sum(r["overdue"] for r in items),
        "customers": items,
    }
