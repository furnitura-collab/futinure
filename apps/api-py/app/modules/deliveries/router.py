"""
Yetkazish (AdminDeliveriesController, DriverController).
"""

from typing import Annotated

from fastapi import Depends, File, UploadFile

from app.auth.deps import AuthUser, Staff, require_roles
from app.core.files import read_upload
from app.core.http import api_router
from app.core.params import UuidPath, uuid_path
from app.db import Db, transaction
from app.modules.deliveries import service as deliveries
from app.modules.deliveries.schemas import AssignDeliveryInput, DriverDeliverInput, DriverFailInput, DriverStartInput
from app.modules.orders import admin as orders
from app.modules.orders.schemas import body_of
from app.services.storage import MAX_RECEIPT_BYTES, private_file_response, save_private, upload_json

router = api_router(tags=["deliveries"])

Driver = Annotated[AuthUser, Depends(require_roles("DRIVER"))]
OrderId = Annotated[str, Depends(uuid_path("orderId"))]


# ───────────── Admin ─────────────


@router.get("/admin/drivers")
async def drivers(u: Staff, db: Db):
    return await deliveries.drivers(db)


@router.put("/admin/orders/{id}/delivery")
async def assign(u: Staff, id: UuidPath, body: Annotated[AssignDeliveryInput, Depends(body_of(AssignDeliveryInput))], db: Db):
    """Haydovchi biriktirish / almashtirish / olib tashlash"""
    await deliveries.assign(db, id, body, u)
    return await orders.detail(db, id, u)


@router.get("/admin/orders/{id}/delivery/proof")
async def proof(
    u: Annotated[AuthUser, Depends(require_roles("MANAGER", "SUPER_ADMIN", "WAREHOUSE", "DRIVER"))], id: UuidPath, db: Db
):
    upload = await deliveries.proof_for(db, id, u)
    return private_file_response(upload)


# ───────────── Haydovchi mobil ilovasi ─────────────


@router.get("/driver/deliveries")
async def driver_list(u: Driver, db: Db):
    return await deliveries.driver_list(db, u)


@router.get("/driver/deliveries/{orderId}")
async def driver_detail(u: Driver, order_id: OrderId, db: Db):
    return await deliveries.driver_detail(db, order_id, u)


@router.post("/driver/deliveries/{orderId}/start")
async def start(u: Driver, order_id: OrderId, body: Annotated[DriverStartInput, Depends(body_of(DriverStartInput))], db: Db):
    return await deliveries.start(db, order_id, body, u)


@router.post("/driver/deliveries/{orderId}/deliver")
async def deliver(
    u: Driver, order_id: OrderId, body: Annotated[DriverDeliverInput, Depends(body_of(DriverDeliverInput))], db: Db
):
    return await deliveries.deliver(db, order_id, body, u)


@router.post("/driver/deliveries/{orderId}/fail")
async def fail(u: Driver, order_id: OrderId, body: Annotated[DriverFailInput, Depends(body_of(DriverFailInput))], db: Db):
    return await deliveries.fail(db, order_id, body, u)


@router.post("/driver/uploads/proof", status_code=201)
async def upload_proof(u: Driver, db: Db, file: Annotated[UploadFile | None, File()] = None):
    """Topshirish surati — yopiq fayl, keyin /deliver ga proofUploadId bilan"""
    buf = await read_upload(file, MAX_RECEIPT_BYTES)
    async with transaction(db):
        upload = await save_private(db, u.id, deliveries.DELIVERY_PROOF_PURPOSE, buf)
    return upload_json(upload)
