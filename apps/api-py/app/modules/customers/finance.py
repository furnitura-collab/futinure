"""
Mijoz moliyasi: balans, daftar, akt-sverka, muddati o'tgan qarz.
HTTP yo'llari payments modulida: /me/balance, /me/ledger, /me/reconciliation, /admin/customers/:id/ledger|reconciliation.
"""

from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError
from app.core.serialize import row
from app.domain.dates import business_date, day_start, next_day_start, to_date
from app.models import CustomerProfile, LedgerEntry, Payment, User
from app.modules.customers.credit_orders import UNPAID_CREDIT_ORDER_SQL
from app.modules.customers.schemas import LedgerQuery, PeriodQuery


async def balance(db: AsyncSession, customer_id: str) -> dict[str, Any]:
    """
    Mijoz balansi. 404 NOT_FOUND "Mijoz" — profil yo'q bo'lsa.
    balance: musbat — mijoz qarzdor, manfiy — haqdor.
    """
    profile = await db.get(CustomerProfile, customer_id)
    if not profile:
        raise AppError.not_found("Mijoz")
    overdue = await overdue_amount(db, customer_id)
    pending = await db.scalar(
        select(func.sum(Payment.amount)).where(Payment.customer_id == customer_id, Payment.status == "PENDING")
    )
    bal = profile.balance_cached
    return {
        # Musbat — mijoz qarzdor, manfiy — haqdor
        "balance": bal,
        "creditLimit": profile.credit_limit,
        "availableCredit": profile.credit_limit - bal if profile.credit_limit > bal else 0,
        "paymentTermDays": profile.payment_term_days,
        "overdueAmount": overdue,
        "pendingPayments": int(pending or 0),
        "allowedPaymentMethods": profile.allowed_payment_methods,
    }


async def overdue_amount(db: AsyncSession, customer_id: str) -> int:
    """Nasiya muddati o'tgan, to'lanmagan qism (buyurtmalar bo'yicha)"""
    total = await db.scalar(
        text(
            "SELECT SUM(grand_total - paid_total)::bigint AS sum FROM orders "
            f"WHERE customer_id = CAST(:id AS uuid) AND {UNPAID_CREDIT_ORDER_SQL} AND due_date < CAST(:today AS date)"
        ),
        {"id": customer_id, "today": to_date(business_date())},
    )
    return int(total or 0)


def _ledger_json(e: LedgerEntry) -> dict[str, Any]:
    return row(
        e,
        order=e.order and {"id": e.order.id, "number": e.order.number},
        payment=e.payment and {"id": e.payment.id, "method": e.payment.method},
    )


async def ledger(db: AsyncSession, customer_id: str, q: LedgerQuery) -> dict[str, Any]:
    """Hisob daftari (sahifalangan, yangidan eskiga). Javob: { items, total, page, limit }"""
    conds: list[Any] = [LedgerEntry.customer_id == customer_id]
    if q.date_from:
        conds.append(LedgerEntry.created_at >= day_start(q.date_from))
    if q.date_to:
        conds.append(LedgerEntry.created_at < next_day_start(q.date_to))
    rows = await db.scalars(
        select(LedgerEntry)
        .options(selectinload(LedgerEntry.order), selectinload(LedgerEntry.payment))
        .where(*conds)
        .order_by(LedgerEntry.created_at.desc())
        .offset((q.page - 1) * q.limit)
        .limit(q.limit)
    )
    items = [_ledger_json(e) for e in rows]
    total = await db.scalar(select(func.count()).select_from(LedgerEntry).where(*conds)) or 0
    return {"items": items, "total": total, "page": q.page, "limit": q.limit}


async def reconciliation(db: AsyncSession, customer_id: str, q: PeriodQuery) -> dict[str, Any]:
    """
    Akt-sverka: davr boshidagi qoldiq, yozuvlar, aylanmalar, davr oxiridagi qoldiq.
    Davr berilmasa — joriy oyning boshidan bugungacha. from > to → 422 INVALID_PERIOD.
    """
    today = business_date()
    date_from = q.date_from or f"{today[:8]}01"
    date_to = q.date_to or today
    if date_from > date_to:
        raise AppError("INVALID_PERIOD", "Davr boshi oxiridan keyin", 422)

    user = await db.scalar(select(User).options(selectinload(User.customer_profile)).where(User.id == customer_id))
    if not user:
        raise AppError.not_found("Mijoz")
    p = user.customer_profile
    customer = {
        "id": user.id,
        "phone": user.phone,
        "fullName": user.full_name,
        "customerProfile": p and {"companyName": p.company_name, "inn": p.inn},
    }

    opening = await db.scalar(
        select(LedgerEntry.balance_after)
        .where(LedgerEntry.customer_id == customer_id, LedgerEntry.created_at < day_start(date_from))
        .order_by(LedgerEntry.created_at.desc())
        .limit(1)
    )
    entries = list(
        await db.scalars(
            select(LedgerEntry)
            .options(selectinload(LedgerEntry.order))
            .where(
                LedgerEntry.customer_id == customer_id,
                LedgerEntry.created_at >= day_start(date_from),
                LedgerEntry.created_at < next_day_start(date_to),
            )
            .order_by(LedgerEntry.created_at.asc())
        )
    )
    opening = int(opening or 0)
    debit = sum(e.amount for e in entries if e.amount > 0)
    credit = sum(-e.amount for e in entries if e.amount < 0)
    return {
        "customer": customer,
        "period": {"from": date_from, "to": date_to},
        "openingBalance": opening,
        "totalDebit": debit,
        "totalCredit": credit,
        "closingBalance": opening + debit - credit,
        "entries": [row(e, order=e.order and {"number": e.order.number}) for e in entries],
    }
