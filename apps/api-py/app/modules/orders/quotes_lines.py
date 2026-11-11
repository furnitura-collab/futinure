"""Takliflar: o'zgarishlardan taklif qatorlarini hisoblash."""

from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.serialize import decimal_str
from app.domain.pricing import line_total
from app.models import OrderItem
from app.modules.cart.service import is_blocking_issue
from app.modules.catalog.pricing import price_lines
from app.modules.orders.lock import LockedOrder
from app.modules.orders.schemas import QuoteInput


def _snapshot(item: OrderItem) -> dict[str, Any]:
    return {
        "variantId": item.variant_id,
        "sku": item.sku,
        "nameUz": item.name_uz,
        "nameRu": item.name_ru,
        "unit": item.unit,
        "attributes": item.attributes,
    }


async def _build_lines(
    db: AsyncSession, order: LockedOrder, body: QuoteInput
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Yakuniy qatorlar ro'yxati. Narx: o'zgargan/yangi qatorlar — joriy katalog narxi (yoki menejer narxi),
    o'zgarmagan qatorlar — buyurtmadagi narx.
    """
    items = order.items
    by_id = {i.id: i for i in items}
    for item_id in [c.item_id for c in body.item_changes] + [r.item_id for r in body.replacements]:
        if item_id not in by_id:
            raise AppError("ITEM_NOT_IN_ORDER", "Qator bu buyurtmada yo'q", 422, {"itemId": item_id})
    changes = {c.item_id: c for c in body.item_changes}
    replacements = {r.item_id: r for r in body.replacements}

    # Har yakuniy qator uchun: harakat, eski qator, variant, miqdor, narx override
    drafts: list[dict[str, Any]] = []
    for item in items:
        repl = replacements.get(item.id)
        change = changes.get(item.id)
        if repl:
            drafts.append(
                {"action": "REPLACE", "item": item, "variant_id": repl.variant_id, "qty": repl.qty, "override": repl.unit_price}
            )
        elif change and Decimal(change.qty) == 0:
            drafts.append({"action": "REMOVE", "item": item, "variant_id": item.variant_id, "qty": "0", "override": None})
        elif change and (item.qty != Decimal(change.qty) or change.unit_price is not None):
            drafts.append(
                {
                    "action": "CHANGE",
                    "item": item,
                    "variant_id": item.variant_id,
                    "qty": change.qty,
                    "override": change.unit_price,
                }
            )
        else:
            drafts.append(
                {"action": "KEEP", "item": item, "variant_id": item.variant_id, "qty": decimal_str(item.qty), "override": None}
            )
    for a in body.additions:
        drafts.append({"action": "ADD", "item": None, "variant_id": a.variant_id, "qty": a.qty, "override": a.unit_price})

    active = [d for d in drafts if d["action"] != "REMOVE"]
    if not active:
        raise AppError(
            "QUOTE_EMPTY",
            'Taklifda kamida bitta tovar bo\'lishi kerak. Buyurtmani bekor qilish uchun "Bekor qilish"dan foydalaning',
            422,
        )

    priced = await price_lines(db, order.customer_id, [(d["variant_id"], d["qty"]) for d in active])

    invalid: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    lines: list[dict[str, Any]] = []
    p = 0
    for d in drafts:
        old: OrderItem | None = d["item"]
        action = d["action"]
        if action == "REMOVE":
            assert old is not None
            lines.append(
                {
                    **_snapshot(old),
                    "action": "REMOVE",
                    "itemId": old.id,
                    "oldQty": decimal_str(old.qty),
                    "qty": "0",
                    "oldUnitPrice": old.unit_price,
                    "unitPrice": old.unit_price,
                    "lineTotal": 0,
                }
            )
            continue
        line = priced.lines[p]
        p += 1
        blocking = [i for i in line.issues if is_blocking_issue(i["code"])]
        # O'zgarmagan qatordagi muammo menejerning qarori — faqat ogohlantirish
        if blocking and action != "KEEP":
            invalid.append({"variantId": d["variant_id"], "sku": line.sku, "issues": blocking})
        non_blocking = [i for i in line.issues if action == "KEEP" or not is_blocking_issue(i["code"])]
        if non_blocking:
            warnings.append({"sku": line.sku or (old.sku if old else None), "issues": non_blocking})

        if action == "KEEP":
            assert old is not None
            lines.append(
                {
                    **_snapshot(old),
                    "action": "KEEP",
                    "itemId": old.id,
                    "oldQty": d["qty"],
                    "qty": d["qty"],
                    "oldUnitPrice": old.unit_price,
                    "unitPrice": old.unit_price,
                    "lineTotal": old.line_total,
                }
            )
            continue
        unit_price = d["override"] if d["override"] is not None else line.unit_price
        changed = old is not None and action == "CHANGE"
        lines.append(
            {
                "action": action,
                "itemId": old.id if old else None,
                "variantId": d["variant_id"],
                "sku": line.sku or "",
                "nameUz": line.name_uz or "",
                "nameRu": line.name_ru or "",
                "unit": line.unit or "",
                "attributes": line.attributes,
                "oldQty": decimal_str(old.qty) if changed and old else None,
                "qty": d["qty"],
                "oldUnitPrice": old.unit_price if changed and old else None,
                "unitPrice": unit_price,
                "lineTotal": line_total(d["qty"], unit_price),
                "replaces": {"sku": old.sku, "nameUz": old.name_uz, "nameRu": old.name_ru}
                if action == "REPLACE" and old
                else None,
            }
        )
    if invalid:
        raise AppError("QUOTE_INVALID_LINES", "Ba'zi qatorlar noto'g'ri", 422, {"lines": invalid})
    return lines, warnings
