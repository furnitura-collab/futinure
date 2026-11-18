"""
To'lovlar va mijozlar moliyasi
(CustomerPaymentsController, PaymentReceiptController, AdminPaymentsController).
Mijozlar servislari (ro'yxat, kartochka, ledger, akt-sverka, tuzatish, qaytarish) — app/modules/customers.
"""

from typing import Annotated

from fastapi import Depends, File, UploadFile

from app.auth.deps import AuthUser, require_roles
from app.auth.permissions import Can
from app.core.files import read_upload
from app.core.http import api_router
from app.core.params import UuidPath
from app.db import Db, transaction
from app.modules.catalog.schemas import query_model
from app.modules.customers import admin as customers
from app.modules.customers import finance
from app.modules.customers.schemas import (
    AdminCustomerListQuery,
    AdminCustomerUpdate,
    LedgerAdjustInput,
    LedgerQuery,
    PeriodQuery,
    RefundInput,
)
from app.modules.orders.schemas import body_of
from app.modules.payments import service as payments
from app.modules.payments.schemas import (
    AdminPaymentInput,
    CustomerPaymentInput,
    PageParams,
    PaymentListQuery,
    RejectPaymentInput,
)
from app.services.storage import MAX_RECEIPT_BYTES, RECEIPT_PURPOSE, private_file_response, save_private, upload_json

PaymentsManage = Can("payments.manage")
PaymentsAdjust = Can("payments.adjust")
CustomersManage = Can("customers.manage")
ReceiptViewer = Can("payments.manage", "CUSTOMER")

router = api_router(tags=["payments"])

Customer = Annotated[AuthUser, Depends(require_roles("CUSTOMER"))]


# ───────────── Mijoz ─────────────


@router.post("/uploads/receipts", status_code=201)
async def upload_receipt(u: Customer, db: Db, file: Annotated[UploadFile | None, File()] = None):
    """Chek: avval yuklanadi, keyin to'lovga uploadId bilan biriktiriladi"""
    buf = await read_upload(file, MAX_RECEIPT_BYTES)
    async with transaction(db):
        upload = await save_private(db, u.id, RECEIPT_PURPOSE, buf)
    return upload_json(upload)


@router.post("/orders/{id}/payments", status_code=201)
async def pay_order(
    u: Customer, id: UuidPath, body: Annotated[CustomerPaymentInput, Depends(body_of(CustomerPaymentInput))], db: Db
):
    return await payments.report_for_order(db, u, id, body)


@router.post("/me/payments", status_code=201)
async def pay_debt(u: Customer, body: Annotated[CustomerPaymentInput, Depends(body_of(CustomerPaymentInput))], db: Db):
    return await payments.report_for_debt(db, u, body)


@router.get("/me/payments")
async def my_payments(u: Customer, db: Db, q: Annotated[PageParams, Depends(query_model(PageParams))]):
    return await payments.customer_payments(db, u.id, q)


@router.get("/me/balance")
async def balance(u: Customer, db: Db):
    return await finance.balance(db, u.id)


@router.get("/me/ledger")
async def ledger(u: Customer, db: Db, q: Annotated[LedgerQuery, Depends(query_model(LedgerQuery))]):
    return await finance.ledger(db, u.id, q)


@router.get("/me/reconciliation")
async def reconciliation(u: Customer, db: Db, q: Annotated[PeriodQuery, Depends(query_model(PeriodQuery))]):
    return await finance.reconciliation(db, u.id, q)


# ───────────── Chek va rekvizitlar ─────────────


@router.get("/payment-info")
async def payment_info(db: Db):
    """Karta raqami va bank rekvizitlari — o'tkazma qilish uchun (ochiq)"""
    return await payments.payment_info(db)


@router.get("/payments/{id}/receipt")
async def receipt(u: ReceiptViewer, id: UuidPath, db: Db):
    upload = await payments.receipt_for(db, id, u)
    return private_file_response(upload)


# ───────────── Admin ─────────────


@router.get("/admin/payments")
async def admin_list(u: PaymentsManage, db: Db, q: Annotated[PaymentListQuery, Depends(query_model(PaymentListQuery))]):
    return await payments.list_payments(db, q)


@router.get("/admin/payments/{id}")
async def admin_get(u: PaymentsManage, id: UuidPath, db: Db):
    return await payments.get(db, id)


@router.post("/admin/payments", status_code=201)
async def admin_record(u: PaymentsManage, body: Annotated[AdminPaymentInput, Depends(body_of(AdminPaymentInput))], db: Db):
    return await payments.record(db, body, u)


@router.post("/admin/payments/{id}/confirm")
async def admin_confirm(u: PaymentsManage, id: UuidPath, db: Db):
    return await payments.confirm(db, id, u)


@router.post("/admin/payments/{id}/reject")
async def admin_reject(
    u: PaymentsManage, id: UuidPath, body: Annotated[RejectPaymentInput, Depends(body_of(RejectPaymentInput))], db: Db
):
    return await payments.reject(db, id, body.reason, u)


@router.get("/admin/customers")
async def customer_list(
    u: CustomersManage, db: Db, q: Annotated[AdminCustomerListQuery, Depends(query_model(AdminCustomerListQuery))]
):
    return await customers.list_customers(db, q)


@router.get("/admin/customers/{id}")
async def customer_detail(u: CustomersManage, id: UuidPath, db: Db):
    return await customers.detail(db, id)


@router.patch("/admin/customers/{id}")
async def customer_update(
    u: CustomersManage, id: UuidPath, body: Annotated[AdminCustomerUpdate, Depends(body_of(AdminCustomerUpdate))], db: Db
):
    return await customers.update(db, id, body, u)


@router.get("/admin/customers/{id}/ledger")
async def customer_ledger(u: CustomersManage, id: UuidPath, db: Db, q: Annotated[LedgerQuery, Depends(query_model(LedgerQuery))]):
    return await finance.ledger(db, id, q)


@router.get("/admin/customers/{id}/reconciliation")
async def customer_reconciliation(
    u: CustomersManage, id: UuidPath, db: Db, q: Annotated[PeriodQuery, Depends(query_model(PeriodQuery))]
):
    return await finance.reconciliation(db, id, q)


@router.post("/admin/customers/{id}/ledger/adjust", status_code=201)
async def customer_adjust(
    u: PaymentsAdjust, id: UuidPath, body: Annotated[LedgerAdjustInput, Depends(body_of(LedgerAdjustInput))], db: Db
):
    return await customers.adjust(db, id, body, u)


@router.post("/admin/customers/{id}/refunds", status_code=201)
async def customer_refund(u: PaymentsAdjust, id: UuidPath, body: Annotated[RefundInput, Depends(body_of(RefundInput))], db: Db):
    return await customers.refund(db, id, body, u)


@router.get("/admin/reports/receivables")
async def receivables(u: CustomersManage, db: Db):
    return await customers.receivables(db)
