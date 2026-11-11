"""
Yetkazish va haydovchi ilovasi.

    from app.modules.deliveries import service as deliveries

    await deliveries.assign(db, order_id, body, actor)      # menejer: haydovchi biriktirish
    await deliveries.driver_list(db, driver)                # haydovchi: faol va bugun topshirilganlar
    await deliveries.deliver(db, order_id, body, driver)    # status + surat + naqd pul — bitta tranzaksiyada
"""

from app.modules.deliveries.service_common import ACTIVE, ASSIGNABLE, DELIVERY_PROOF_PURPOSE
from app.modules.deliveries.service_driver import deliver, driver_detail, driver_list, fail, proof_for, start
from app.modules.deliveries.service_manager import assign, drivers

__all__ = [
    "DELIVERY_PROOF_PURPOSE",
    "ASSIGNABLE",
    "ACTIVE",
    "drivers",
    "assign",
    "driver_list",
    "driver_detail",
    "start",
    "deliver",
    "fail",
    "proof_for",
]
