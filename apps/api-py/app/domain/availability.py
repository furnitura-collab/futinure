"""
Mijozga aniq qoldiq ko'rsatilmaydi, faqat daraja (docs/05-questions.md, 5-savol).
Sotuvga mavjud = stock − reserved. packages/shared/src/availability.ts bilan bir xil.
"""

from typing import Literal

from app.domain.quantity import QtyInput, to_milli

StockLevel = Literal["IN_STOCK", "LOW", "ON_ORDER", "OUT_OF_STOCK"]


def available_milli(stock_qty: QtyInput, reserved_qty: QtyInput) -> int:
    return max(0, (to_milli(stock_qty) or 0) - (to_milli(reserved_qty) or 0))


def stock_level(stock_qty: QtyInput, reserved_qty: QtyInput, low_stock_threshold: QtyInput, on_order: bool) -> StockLevel:
    """on_order — admin "buyurtma asosida" deb belgilagan (DB'da availability = ON_ORDER)"""
    available = available_milli(stock_qty, reserved_qty)
    if available > 0:
        return "LOW" if available <= (to_milli(low_stock_threshold) or 0) else "IN_STOCK"
    return "ON_ORDER" if on_order else "OUT_OF_STOCK"


def is_orderable(level: StockLevel) -> bool:
    """Savatga qo'shish mumkinmi (yo'q tovarni faqat ON_ORDER bo'lsa)"""
    return level != "OUT_OF_STOCK"
