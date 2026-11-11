"""
To'lovlar.

    from app.modules.payments import service as payments

    await payments.report_for_order(db, customer, order_id, body)    # mijoz: chek bilan, PENDING
    await payments.record(db, body, actor)                            # menejer: darhol CONFIRMED
    async with transaction(db):
        await payments.create_driver_cash(db, order, amount, driver)  # haydovchi topshirishda olgan naqd
"""

from app.modules.payments.service_common import METHOD_LABEL, PAYABLE, payment_json
from app.modules.payments.service_customer import create_driver_cash, customer_payments, report_for_debt, report_for_order
from app.modules.payments.service_manager import confirm, get, list_payments, payment_info, receipt_for, record, reject

__all__ = [
    "PAYABLE",
    "METHOD_LABEL",
    "payment_json",
    "report_for_order",
    "report_for_debt",
    "create_driver_cash",
    "customer_payments",
    "list_payments",
    "record",
    "confirm",
    "reject",
    "get",
    "receipt_for",
    "payment_info",
]
