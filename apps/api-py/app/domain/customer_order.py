"""Mijoz ko'rinishi — packages/shared/src/customer-order.ts (bosqichlar va hozir to'lanadigan summa)."""

# Mijozga ko'rinadigan 4 bosqich. Ichki statuslar (7 ta) mijoz uchun ortiqcha
CUSTOMER_STAGES = ("PLACED", "PREPARING", "ON_THE_WAY", "HANDED_OVER")

_STAGE_OF = {
    "NEW": 0,
    "PREPARING": 1,
    "READY": 2,
    "OUT_FOR_DELIVERY": 2,
    "DELIVERED": 3,
    "COMPLETED": 3,
    "CANCELLED": -1,
}

_AFTER_HANDOVER = ("DELIVERED", "COMPLETED")
_AT_HANDOVER = ("READY", "OUT_FOR_DELIVERY", *_AFTER_HANDOVER)


def customer_stage(status: str) -> int:
    """Joriy bosqich indeksi (0–3); bekor qilingan buyurtma — -1"""
    return _STAGE_OF[status]


def amount_due_now(
    *,
    status: str,
    payment_terms: str | None,
    grand_total: int,
    paid_total: int,
    advance_amount: int,
    pending_total: int = 0,
) -> int:
    """
    Mijoz HOZIR to'lashi kerak bo'lgan summa (0 — hozircha to'lov kutilmaydi).
    PREPAID — hammasi, ADVANCE — avans, topshirishda — tayyor bo'lganda (eski nasiya — topshirilgach).
    pending_total — tekshirilayotgan cheklar (qayta so'ramaymiz).
    """
    if not payment_terms or status == "CANCELLED":
        return 0
    balance = grand_total - paid_total
    match payment_terms:
        case "PREPAID":
            required = balance
        case "ADVANCE":
            required = balance if status in _AT_HANDOVER else advance_amount - paid_total
        case "ON_DELIVERY":
            required = balance if status in _AT_HANDOVER else 0
        case _:  # eski nasiya buyurtmasi — topshirilgan, qolgan qarz to'lanadi
            required = balance if status in ("DELIVERED", "COMPLETED") else 0
    return max(0, min(balance, required) - pending_total)
