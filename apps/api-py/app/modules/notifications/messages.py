"""Bildirishnoma matnlari (uz/ru/en)"""

import re
from typing import TypedDict


class Template(TypedDict):
    title: dict[str, str]
    body: dict[str, str]


def _t(title: tuple[str, str, str], body: tuple[str, str, str]) -> Template:
    return {"title": dict(zip(("uz", "ru", "en"), title, strict=True)), "body": dict(zip(("uz", "ru", "en"), body, strict=True))}


# Mijozga bildirishnoma beriladigan statuslar
STATUS_TEXT: dict[str, Template] = {
    "PREPARING": _t(
        ("Buyurtma qabul qilindi", "Заказ принят", "Order accepted"),
        (
            "{number} qabul qilindi va yig'ilmoqda. Jami: {total}",
            "{number} принят и собирается. Итого: {total}",
            "{number} is accepted and being packed. Total: {total}",
        ),
    ),
    "READY": _t(
        ("Buyurtma tayyor", "Заказ готов", "Order is ready"),
        ("{number} tayyor", "{number} готов", "{number} is ready"),
    ),
    "OUT_FOR_DELIVERY": _t(
        ("Buyurtma yo'lda", "Заказ в пути", "Order is on its way"),
        ("{number} sizga yetkazilmoqda", "{number} доставляется", "{number} is out for delivery"),
    ),
    "DELIVERED": _t(
        ("Buyurtma topshirildi", "Заказ передан", "Order delivered"),
        ("{number} topshirildi. Rahmat!", "{number} передан. Спасибо!", "{number} has been delivered. Thank you!"),
    ),
    "CANCELLED": _t(
        ("Buyurtma bekor qilindi", "Заказ отменён", "Order cancelled"),
        ("{number}: {comment}", "{number}: {comment}", "{number}: {comment}"),
    ),
}

READY_FOR_PICKUP = _t(
    ("Olib ketishga tayyor", "Готов к выдаче", "Ready for pickup"),
    ("{number} omborda sizni kutmoqda", "{number} ждёт вас на складе", "{number} is waiting for you at the warehouse"),
)

DELIVERY_FAILED = _t(
    ("Yetkazib bo'lmadi", "Доставка не состоялась", "Delivery failed"),
    (
        "{number}: {comment}. Menejer siz bilan bog'lanadi",
        "{number}: {comment}. Менеджер свяжется с вами",
        "{number}: {comment}. Your manager will contact you",
    ),
)

TEXTS: dict[str, Template] = {
    "termsSet": _t(
        ("To'lov kutilmoqda", "Ожидается оплата", "Payment required"),
        (
            "{number}: {amount} to'lang — to'lovdan keyin buyurtma yig'ila boshlaydi",
            "{number}: оплатите {amount} — после оплаты заказ начнут собирать",
            "{number}: please pay {amount} — the order will be packed after payment",
        ),
    ),
    "paymentConfirmed": _t(
        ("To'lov qabul qilindi", "Оплата принята", "Payment received"),
        ("{amount} qabul qilindi{order}", "Получено {amount}{order}", "{amount} received{order}"),
    ),
    "paymentRejected": _t(
        ("To'lov rad etildi", "Оплата отклонена", "Payment rejected"),
        ("{amount}: {reason}", "{amount}: {reason}", "{amount}: {reason}"),
    ),
    "chat": _t(
        ("Menejerdan xabar", "Сообщение от менеджера", "Message from your manager"),
        ("{number}: {text}", "{number}: {text}", "{number}: {text}"),
    ),
    "deliveryAssigned": _t(
        ("Yangi yetkazish", "Новая доставка", "New delivery"),
        ("{number}: {address}", "{number}: {address}", "{number}: {address}"),
    ),
    "debtSoon": _t(
        ("To'lov muddati yaqin", "Скоро срок оплаты", "Payment due soon"),
        (
            "{number}: {due} gacha {amount} to'lash kerak",
            "{number}: до {due} нужно оплатить {amount}",
            "{number}: {amount} is due by {due}",
        ),
    ),
    "debtOverdue": _t(
        ("To'lov muddati o'tgan", "Просрочена оплата", "Payment overdue"),
        (
            "{number}: {amount} qarz, muddat {due} edi",
            "{number}: долг {amount}, срок был {due}",
            "{number}: {amount} outstanding, was due {due}",
        ),
    ),
}

_PLACEHOLDER = re.compile(r"\{(\w+)\}", re.ASCII)


def render(t: Template, locale: str, params: dict[str, str]) -> tuple[str, str]:
    """{kalit} → qiymat; yo'q kalit — bo'sh satr. Qaytaradi: (title, body)"""

    def fill(s: str) -> str:
        return _PLACEHOLDER.sub(lambda m: params.get(m[1], ""), s)

    return fill(t["title"][locale]), fill(t["body"][locale])
