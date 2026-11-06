"""Buyurtma shartlari"""

from typing import Any

from app.core.errors import AppError
from app.domain.dates import add_days, business_date, is_valid_iso_date, to_date
from app.models import CustomerProfile
from app.modules.orders.schemas import MAX_DELIVERY_DAYS_AHEAD, TermsDict

# Totals: {itemsTotal, servicesTotal, deliveryFee, discountTotal, grandTotal} (OrderTotals.as_dict())
Totals = dict[str, int]


def valid_delivery_date(d: str) -> bool:
    today = business_date()
    return is_valid_iso_date(d) and today <= d <= add_days(today, MAX_DELIVERY_DAYS_AHEAD)


def validate_terms(terms: TermsDict, totals: Totals, profile: CustomerProfile | None) -> None:
    """Shartlarni mijoz profili va summaga nisbatan tekshiradi"""
    subtotal = totals["itemsTotal"] + totals["servicesTotal"] + totals["deliveryFee"]
    if terms["discountTotal"] > subtotal:
        raise AppError("DISCOUNT_TOO_LARGE", "Chegirma summadan katta", 422)
    if terms["advanceAmount"] > totals["grandTotal"]:
        raise AppError("ADVANCE_TOO_LARGE", "Avans jami summadan katta", 422)
    if terms["paymentTerms"] == "CREDIT" and (not profile or profile.credit_limit <= 0):
        raise AppError("CREDIT_NOT_ALLOWED", "Bu mijozga nasiya ochilmagan (kredit limiti 0)", 422)
    d = terms.get("deliveryDate")
    if d and not valid_delivery_date(d):
        raise AppError("INVALID_DELIVERY_DATE", "Yetkazish sanasi noto'g'ri", 422)


def terms_data(terms: TermsDict, totals: Totals) -> dict[str, Any]:
    """Shartlar va summalarni buyurtmaga yozish uchun (Order ustunlari, snake_case)"""
    data: dict[str, Any] = {
        "payment_terms": terms["paymentTerms"],
        "advance_amount": terms["advanceAmount"],
        "allowed_methods": list(terms["allowedMethods"]),
        "delivery_fee": totals["deliveryFee"],
        "discount_total": totals["discountTotal"],
        "items_total": totals["itemsTotal"],
        "services_total": totals["servicesTotal"],
        "grand_total": totals["grandTotal"],
    }
    if "deliveryDate" in terms:
        d = terms["deliveryDate"]
        data["delivery_date"] = to_date(d) if d else None
    if "vehicleType" in terms:
        data["vehicle_type"] = terms["vehicleType"]
    return data
