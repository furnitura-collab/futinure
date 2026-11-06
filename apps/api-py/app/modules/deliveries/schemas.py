"""Yetkazish sxemalari — packages/shared/src/schemas/delivery.ts nusxasi."""

from pydantic import StrictInt

from app.core.schemas import Money, Schema, Uuid, trimmed
from app.modules.orders.schemas import IsoDate


class AssignDeliveryInput(Schema):
    """
    Menejer: yetkazishga haydovchi biriktiradi (driverId=null — biriktirishni olib tashlash).
    scheduledDate/slot/vehicleType: yuborilmagan (model_fields_set'da yo'q) — avvalgisi qoladi, null — tozalanadi.
    """

    driver_id: Uuid | None
    scheduled_date: IsoDate | None = None
    slot: trimmed(0, 40) | None = None  # type: ignore[valid-type]
    vehicle_type: trimmed(0, 20) | None = None  # type: ignore[valid-type]


class DriverStartInput(Schema):
    """Haydovchi: yo'lga chiqdim"""

    expected_version: StrictInt | None = None


class DriverDeliverInput(Schema):
    """Haydovchi: topshirdim"""

    receiver_name: trimmed(2, 120)  # type: ignore[valid-type]
    # /driver/uploads/proof orqali yuklangan surat
    proof_upload_id: Uuid | None = None
    # Mijozdan olingan naqd pul — kassaga topshirilganda menejer tasdiqlaydi
    cash_collected: Money | None = None
    comment: trimmed(0, 1000) | None = None  # type: ignore[valid-type]
    expected_version: StrictInt | None = None


class DriverFailInput(Schema):
    """Haydovchi: yetkazib bo'lmadi — buyurtma omborga (READY) qaytadi"""

    reason: trimmed(3, 500)  # type: ignore[valid-type]
    expected_version: StrictInt | None = None


# Mobil ilovada tez tanlash uchun sabablar (kalitlar i18n'da)
DRIVER_FAIL_REASONS = ("NO_ANSWER", "NOT_AT_HOME", "REFUSED", "WRONG_ADDRESS", "NO_MONEY", "VEHICLE")
