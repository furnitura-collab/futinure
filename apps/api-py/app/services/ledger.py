from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models import CustomerProfile, LedgerEntry


async def post_ledger(
    db: AsyncSession,
    *,
    customer_id: str,
    type: str,
    amount: int,
    description: str,
    order_id: str | None = None,
    payment_id: str | None = None,
    created_by: str | None = None,
) -> LedgerEntry | None:
    """
    Mijoz hisob daftari. Faqat qo'shiladi, o'zgartirilmaydi — xato teskari yozuv bilan tuzatiladi.
    amount ishorali: musbat — qarz oshadi, manfiy — kamayadi.
    balance_cached shu yerda, yozuv bilan bir tranzaksiyada yangilanadi (transaction() ichida chaqiring).
    """
    if amount == 0:
        return None
    # Bir mijozga parallel yozuvlar balansni buzmasin
    balance = (
        await db.execute(
            text("SELECT balance_cached FROM customer_profiles WHERE user_id = CAST(:id AS uuid) FOR UPDATE"),
            {"id": customer_id},
        )
    ).scalar_one_or_none()
    if balance is None:
        raise AppError.not_found("Mijoz profili")

    balance_after = int(balance) + amount
    profile = await db.get(CustomerProfile, customer_id)
    assert profile is not None
    profile.balance_cached = balance_after
    entry = LedgerEntry(
        customer_id=customer_id,
        type=type,
        amount=amount,
        description=description,
        order_id=order_id,
        payment_id=payment_id,
        created_by=created_by,
        balance_after=balance_after,
    )
    db.add(entry)
    await db.flush()
    return entry
