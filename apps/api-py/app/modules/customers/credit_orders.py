from sqlalchemy import and_, text

from app.models import Order

# Nasiyaga topshirilgan va to'liq to'lanmagan buyurtma (`orders` jadvali, alias'siz) — xom SQL uchun
UNPAID_CREDIT_ORDER_SQL = "payment_terms = 'CREDIT' AND status IN ('DELIVERED', 'COMPLETED') AND grand_total > paid_total"


def unpaid_credit_order():  # noqa: ANN201
    """Xuddi shu shart — SQLAlchemy ifodasi sifatida (select(Order).where(unpaid_credit_order()))"""
    return and_(
        Order.payment_terms == "CREDIT",
        Order.status.in_(("DELIVERED", "COMPLETED")),
        Order.grand_total > Order.paid_total,
    )


UNPAID_CREDIT_ORDER = text(UNPAID_CREDIT_ORDER_SQL)
