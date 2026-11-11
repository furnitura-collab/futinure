"""Buyurtmalar: mijoz yo'llari va admin (ro'yxat, kanban, shartlar, status o'tishlari)"""

from typing import Annotated

from fastapi import Depends, Header

from app.auth.deps import AuthUser, Staff, require_roles
from app.core.errors import AppError
from app.core.http import DumpedJSON, api_router
from app.core.params import UuidPath
from app.db import Db
from app.modules.catalog.schemas import query_model
from app.modules.orders import acceptance, admin, service, workflow
from app.modules.orders.schemas import (
    IDEMPOTENCY_KEY_RE,
    AdminOrderListQuery,
    AssignOrderInput,
    CancelOrderInput,
    CreateOrderInput,
    OrderListQuery,
    SetTermsInput,
    TransitionInput,
    body_of,
    create_order_rule,
    set_terms_rule,
    transition_rule,
)

router = api_router(tags=["orders"])

Customer = Annotated[AuthUser, Depends(require_roles("CUSTOMER"))]
Operator = Annotated[AuthUser, Depends(require_roles("MANAGER", "SUPER_ADMIN", "WAREHOUSE", "DRIVER"))]


# ───────────── Mijoz ─────────────


@router.post("/orders", status_code=201)
async def create(
    u: Customer,
    body: Annotated[CreateOrderInput, Depends(body_of(CreateOrderInput, create_order_rule))],
    db: Db,
    key: Annotated[str | None, Header(alias="idempotency-key")] = None,
):
    """
    Header `Idempotency-Key` majburiy: ilova har "Buyurtma berish" bosilishida bitta kalit yaratadi
    va tarmoq xatosida aynan shu kalit bilan qayta yuboradi.
    """
    if not key or not IDEMPOTENCY_KEY_RE.match(key):
        raise AppError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header kerak (8–64 belgi)", 400)
    order, replayed = await service.create(db, u, body, key)
    if replayed:
        return DumpedJSON(order, status_code=200, headers={"Idempotent-Replayed": "true"})
    return DumpedJSON(order, status_code=201)


@router.get("/orders")
async def list_orders(u: Customer, db: Db, q: Annotated[OrderListQuery, Depends(query_model(OrderListQuery))]):
    return await service.list_orders(db, u.id, q)


@router.get("/orders/{id}")
async def detail(u: Customer, id: UuidPath, db: Db):
    return await service.detail(db, u.id, id)


@router.post("/orders/{id}/cancel")
async def cancel(u: Customer, id: UuidPath, body: Annotated[CancelOrderInput, Depends(body_of(CancelOrderInput))], db: Db):
    return await service.cancel(db, u, id, body.reason)


# ───────────── Admin ─────────────


@router.get("/admin/orders")
async def admin_list(u: Staff, db: Db, q: Annotated[AdminOrderListQuery, Depends(query_model(AdminOrderListQuery))]):
    return await admin.list_orders(db, q)


@router.get("/admin/orders/kanban")
async def admin_kanban(u: Staff, db: Db, q: Annotated[AdminOrderListQuery, Depends(query_model(AdminOrderListQuery))]):
    return await admin.kanban(db, q)


@router.get("/admin/orders/managers")
async def admin_managers(u: Staff, db: Db):
    return await admin.managers(db)


@router.get("/admin/orders/{id}")
async def admin_detail(u: Staff, id: UuidPath, db: Db):
    return await admin.detail(db, id, u)


@router.patch("/admin/orders/{id}/assign")
async def admin_assign(u: Staff, id: UuidPath, body: Annotated[AssignOrderInput, Depends(body_of(AssignOrderInput))], db: Db):
    return await admin.assign(db, id, body.manager_id, u)


@router.put("/admin/orders/{id}/terms")
async def admin_terms(
    u: Staff, id: UuidPath, body: Annotated[SetTermsInput, Depends(body_of(SetTermsInput, set_terms_rule))], db: Db
):
    """Yangi buyurtmaga shartlar (status o'zgarmaydi) — oldindan to'lovda mijoz avansni shundan keyin to'laydi"""
    await acceptance.save_terms(db, id, body, u)
    return await admin.detail(db, id, u)


@router.post("/admin/orders/{id}/transition")
async def admin_transition(
    u: Operator, id: UuidPath, body: Annotated[TransitionInput, Depends(body_of(TransitionInput, transition_rule))], db: Db
):
    """
    Barcha status o'tishlari. Omborchi va haydovchi ham ishlatadi —
    kim nima qila olishini state machine hal qiladi.
    """
    await workflow.run_transition(db, id, body, u)
    return await admin.detail(db, id, u)
