"""
To'lov sxemalari — packages/shared/src/schemas/payments.ts nusxasi (to'lovlar qismi).
Mijozlar moliyasi sxemalari (ledger, akt-sverka, tuzatish, qaytarish) — app/modules/customers/schemas.py.
"""

from app.core.schemas import Schema, Uuid, trimmed
from app.modules.customers.schemas import PositiveMoney
from app.modules.orders.schemas import PageLimit, PageNo, zenum

PAYMENT_METHODS = ("CASH", "CARD_TRANSFER", "CLICK", "PAYME", "BANK_TRANSFER")
PAYMENT_STATUSES = ("PENDING", "CONFIRMED", "REJECTED")

# Mijoz o'zi xabar beradigan usullar: o'tkazma qilib chek yuklaydi.
# Naqdni menejer kiritadi, Click/Payme — integratsiya orqali (3-bosqich).
CUSTOMER_REPORTABLE_METHODS = ("CARD_TRANSFER", "BANK_TRANSFER")
MAX_PENDING_PAYMENTS = 5


class CustomerPaymentInput(Schema):
    amount: PositiveMoney
    method: zenum(*CUSTOMER_REPORTABLE_METHODS)  # type: ignore[valid-type]
    receipt_upload_id: Uuid
    comment: trimmed(0, 500) | None = None  # type: ignore[valid-type]


class AdminPaymentInput(Schema):
    """Menejer qabul qilgan pul — darhol tasdiqlangan bo'ladi"""

    customer_id: Uuid
    order_id: Uuid | None = None
    amount: PositiveMoney
    method: zenum(*PAYMENT_METHODS)  # type: ignore[valid-type]
    comment: trimmed(0, 500) | None = None  # type: ignore[valid-type]


class RejectPaymentInput(Schema):
    reason: trimmed(3, 500)  # type: ignore[valid-type]


class PageParams(Schema):
    """paginationSchema (z.coerce.number())"""

    page: PageNo = 1
    limit: PageLimit = 20


class PaymentListQuery(PageParams):
    status: zenum(*PAYMENT_STATUSES) | None = None  # type: ignore[valid-type]
    customer_id: Uuid | None = None
    order_id: Uuid | None = None
