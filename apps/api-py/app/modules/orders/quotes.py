"""
Takliflar (QUOTED).

    from app.modules.orders import quotes
    await quotes.create(db, order_id, body, actor)      # menejer: {"quote", "warnings"}
    await quotes.accept(db, customer, order_id, quote_id)
    await quotes.reject(db, customer, order_id, quote_id, comment)
    await quotes.expire_due()                           # tizim: muddati o'tganlar → NEW
    quotes.present_quote(q)                             # mijoz va admin uchun bir xil ko'rinish
"""

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import decimal_str
from app.db import standalone_session, transaction
from app.domain.pricing import compute_order_totals, line_total
from app.models import Order, OrderItem, OrderQuote, Setting, utcnow
from app.modules.cart.service import is_blocking_issue
from app.modules.catalog.pricing import price_lines
from app.modules.orders import inventory
from app.modules.orders.lock import LockedOrder, lock_order
from app.modules.orders.schemas import QuoteInput
from app.modules.orders.state_machine import opt, transition
from app.modules.orders.terms import terms_data, validate_terms
from app.services.audit import audit
from app.services.outbox import add_event

log = logging.getLogger("OrderQuotesService")

DEFAULT_TTL_HOURS = 24

# changes JSON: { lines: QuoteLine[], orderVersion: taklifdan keyingi buyurtma versiyasi, terms }


# ───────────── Menejer: taklif yaratish ─────────────


async def create(db: AsyncSession, order_id: str, body: QuoteInput, actor: AuthUser) -> dict[str, Any]:
    async with transaction(db):
        order = await lock_order(db, order_id, body.expected_version)
        if order.status not in ("NEW", "QUOTED"):
            raise AppError("QUOTE_NOT_ALLOWED", "Taklif faqat yangi buyurtmaga yuboriladi", 409, {"status": order.status})

        lines, warnings = await _build_lines(db, order, body)
        totals = compute_order_totals(
            [(ln["qty"], ln["unitPrice"]) for ln in lines if ln["action"] != "REMOVE"],
            services_total=order.services_total,
            delivery_fee=body.delivery_fee,
            discount_total=body.discount_total,
        ).as_dict()
        terms = body.terms()
        validate_terms(terms, totals, order.customer_profile)

        ttl_hours = body.expires_in_hours if body.expires_in_hours is not None else await _ttl_hours(db)
        last = await db.scalar(
            select(OrderQuote.version).where(OrderQuote.order_id == order_id).order_by(OrderQuote.version.desc()).limit(1)
        )
        await db.execute(
            update(OrderQuote)
            .where(OrderQuote.order_id == order_id, OrderQuote.status == "PENDING")
            .values(status="SUPERSEDED")
            .execution_options(synchronize_session=False)
        )

        order_version = order.version + 1
        quote = OrderQuote(
            order_id=order_id,
            version=(last or 0) + 1,
            created_by=actor.id,
            changes={"lines": lines, "orderVersion": order_version, "terms": terms},
            totals=totals,
            payment_terms=terms["paymentTerms"],
            advance_amount=terms["advanceAmount"],
            allowed_methods=terms["allowedMethods"],
            manager_note=body.note,
            status="PENDING",
            expires_at=utcnow() + timedelta(hours=ttl_hours),
        )
        db.add(quote)
        await db.flush()
        # Prisma kabi: JSON maydonlar bazadan (jsonb kalit tartibida) qaytadi
        await db.refresh(quote)

        data: dict[str, Any] = {"current_quote_id": quote.id}
        if not order.manager_id:
            data["manager_id"] = actor.id
        if order.status == "NEW":
            await transition(db, order, "QUOTED", actor, comment=opt(body.note), data=data)
        else:
            # Taklif yangilandi — status o'zgarmaydi, lekin versiya oshadi
            await db.execute(
                update(Order)
                .where(Order.id == order_id)
                .values(**data, version=Order.version + 1)
                .execution_options(synchronize_session=False)
            )
            await audit(
                db,
                actor_id=actor.id,
                entity="order",
                entity_id=order_id,
                action="quote_revised",
                after={"version": quote.version},
            )
        await add_event(db, "order.quote_created", {"orderId": order_id, "quoteId": quote.id})
        return {"quote": present_quote(quote), "warnings": warnings}


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


async def _ttl_hours(db: AsyncSession) -> int | float:
    value = await db.scalar(select(Setting.value).where(Setting.key == "quote.ttl_hours"))
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else DEFAULT_TTL_HOURS


# ───────────── Mijoz: qabul / rad ─────────────


async def accept(db: AsyncSession, customer: AuthUser, order_id: str, quote_id: str) -> None:
    async with transaction(db):
        order, quote, changes = await _active_quote(db, customer, order_id, quote_id)
        if order.version != changes["orderVersion"]:
            raise AppError("ORDER_CONFLICT", "Buyurtma taklifdan keyin o'zgargan", 409)

        await _apply_lines(db, order_id, changes["lines"])
        await recalc_weight(db, order_id)
        totals = quote.totals
        quote.status = "ACCEPTED"
        quote.responded_at = utcnow()
        await db.flush()
        await transition(db, order, "CONFIRMED", customer, data=terms_data(changes["terms"], totals))
        await inventory.reserve(db, order_id, customer.id)


async def reject(db: AsyncSession, customer: AuthUser, order_id: str, quote_id: str, comment: str) -> None:
    async with transaction(db):
        order, quote, _ = await _active_quote(db, customer, order_id, quote_id)
        quote.status = "REJECTED"
        quote.customer_comment = comment
        quote.responded_at = utcnow()
        await db.flush()
        await transition(db, order, "NEW", customer, comment=comment, data={"current_quote_id": None})


async def _active_quote(
    db: AsyncSession, customer: AuthUser, order_id: str, quote_id: str
) -> tuple[LockedOrder, OrderQuote, dict[str, Any]]:
    order = await lock_order(db, order_id)
    if order.customer_id != customer.id:
        raise AppError.not_found("Buyurtma")
    quote = (
        await db.scalars(
            select(OrderQuote)
            .where(OrderQuote.id == quote_id, OrderQuote.order_id == order_id)
            .execution_options(populate_existing=True)
        )
    ).first()
    if not quote:
        raise AppError.not_found("Taklif")
    if order.status != "QUOTED" or order.current_quote_id != quote.id or quote.status != "PENDING":
        raise AppError("QUOTE_NOT_ACTIVE", "Bu taklif endi amal qilmaydi", 409, {"status": quote.status})
    if quote.expires_at < utcnow():
        raise AppError("QUOTE_EXPIRED", "Taklif muddati o'tgan. Menejer yangi taklif yuboradi", 409)
    return order, quote, quote.changes


async def _apply_lines(db: AsyncSession, order_id: str, lines: list[dict[str, Any]]) -> None:
    for ln in lines:
        action = ln["action"]
        if action == "KEEP":
            continue
        if action == "CHANGE":
            await _update_item(db, ln["itemId"], qty=Decimal(ln["qty"]), unit_price=ln["unitPrice"], line_total=ln["lineTotal"])
        elif action == "REMOVE":
            await _update_item(db, ln["itemId"], status="REMOVED")
        elif action in ("REPLACE", "ADD"):
            if action == "REPLACE":
                await _update_item(db, ln["itemId"], status="REMOVED")
            db.add(
                OrderItem(
                    order_id=order_id,
                    variant_id=ln["variantId"],
                    sku=ln["sku"],
                    name_uz=ln["nameUz"],
                    name_ru=ln["nameRu"],
                    unit=ln["unit"],
                    attributes=ln.get("attributes") if ln.get("attributes") is not None else {},
                    requested_qty=Decimal(ln["qty"]),
                    qty=Decimal(ln["qty"]),
                    unit_price=ln["unitPrice"],
                    line_total=ln["lineTotal"],
                    replaced_item_id=ln["itemId"] if action == "REPLACE" else None,
                )
            )
            await db.flush()


async def _update_item(db: AsyncSession, item_id: str, **values: Any) -> None:
    result = await db.execute(
        update(OrderItem).where(OrderItem.id == item_id).values(**values).execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:  # type: ignore[attr-defined]
        raise AppError("NOT_FOUND", "Yozuv topilmadi", 404)


async def recalc_weight(db: AsyncSession, order_id: str) -> None:
    """Tarkib o'zgargach og'irlik va hajm (yetkazishda mashina tanlash uchun)"""
    await db.execute(
        text(
            """
            UPDATE orders SET
              total_weight_kg = t.weight,
              total_volume_m3 = t.volume
            FROM (
              SELECT COALESCE(SUM(oi.qty * COALESCE(p.weight_kg, 0)), 0) AS weight,
                     COALESCE(SUM(oi.qty * COALESCE(p.volume_m3, 0)), 0) AS volume
              FROM order_items oi
              JOIN product_variants v ON v.id = oi.variant_id
              JOIN products p ON p.id = v.product_id
              WHERE oi.order_id = CAST(:id AS uuid) AND oi.status = 'ACTIVE'
            ) t
            WHERE orders.id = CAST(:id AS uuid)
            """
        ),
        {"id": order_id},
    )


# ───────────── Tizim: muddati o'tgan takliflar ─────────────


async def expire_due(now: datetime | None = None) -> int:
    """Qaytaradi: qancha taklif muddati o'tgan deb belgilandi"""
    now = now or utcnow()
    async with standalone_session() as db:
        due = (
            await db.execute(
                select(OrderQuote.id, OrderQuote.order_id)
                .where(OrderQuote.status == "PENDING", OrderQuote.expires_at < now)
                .limit(100)
            )
        ).all()
    for q in due:
        try:
            async with standalone_session() as db, transaction(db):
                order = await lock_order(db, q.order_id)
                result = await db.execute(
                    update(OrderQuote)
                    .where(OrderQuote.id == q.id, OrderQuote.status == "PENDING")
                    .values(status="EXPIRED")
                    .execution_options(synchronize_session=False)
                )
                if result.rowcount and order.status == "QUOTED" and order.current_quote_id == q.id:  # type: ignore[attr-defined]
                    await transition(db, order, "NEW", None, comment="Taklif muddati o'tdi", data={"current_quote_id": None})
        except Exception:
            log.exception("Taklif %s muddatini yopib bo'lmadi", q.id)
    return len(due)


def present_quote(q: OrderQuote) -> dict[str, Any]:
    """Taklif — mijoz va admin uchun bir xil ko'rinish"""
    changes = q.changes or {}
    return {
        "id": q.id,
        "version": q.version,
        "status": q.status,
        "lines": changes.get("lines"),
        "totals": q.totals,
        "terms": changes.get("terms"),
        "paymentTerms": q.payment_terms,
        "advanceAmount": q.advance_amount,
        "allowedMethods": q.allowed_methods,
        "managerNote": q.manager_note,
        "customerComment": q.customer_comment,
        "expiresAt": q.expires_at,
        "respondedAt": q.responded_at,
        "createdAt": q.created_at,
    }
