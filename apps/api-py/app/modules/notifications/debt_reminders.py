"""
Nasiya eslatmalari: muddatdan 2 kun oldin, muddat kuni va keyin har 3 kunda (debt-reminder.scheduler.ts).
Har soat ishlaydi; bir buyurtmaga bir kunda bitta eslatma (stable_uuid kaliti).
"""

import asyncio
import logging

from sqlalchemy import text

from app.db import standalone_session
from app.domain.dates import add_days, business_date, to_date
from app.modules.customers.credit_orders import UNPAID_CREDIT_ORDER_SQL
from app.modules.notifications.messages import TEXTS
from app.modules.notifications.service import NotifyInput, Som, notify, stable_uuid

log = logging.getLogger("DebtReminderScheduler")

INTERVAL_SECONDS = 60 * 60
SOON_DAYS = 2
OVERDUE_EVERY_DAYS = 3


async def run(today: str | None = None) -> int:
    """Qaytaradi: yuborilgan eslatmalar soni. today — "YYYY-MM-DD" (standart: Toshkent bo'yicha bugun)"""
    today = today or business_date()
    async with standalone_session() as db:
        orders = (
            await db.execute(
                text(f"""
      SELECT id, number, customer_id, (grand_total - paid_total)::bigint AS due, due_date,
             (due_date - CAST(:today AS date))::int AS days_left
      FROM orders
      WHERE {UNPAID_CREDIT_ORDER_SQL} AND due_date IS NOT NULL
        AND due_date <= CAST(:soon AS date)"""),
                {"today": to_date(today), "soon": to_date(add_days(today, SOON_DAYS))},
            )
        ).all()

        sent = 0
        for o in orders:
            days_left = int(o.days_left)
            overdue_days = -days_left
            remind = days_left == SOON_DAYS or days_left == 0 or (overdue_days > 0 and overdue_days % OVERDUE_EVERY_DAYS == 0)
            if not remind:
                continue
            overdue = overdue_days > 0
            ok = await notify(
                db,
                NotifyInput(
                    event_id=stable_uuid(f"debt:{o.id}:{today}"),
                    user_id=str(o.customer_id),
                    type="debt.overdue" if overdue else "debt.soon",
                    template=TEXTS["debtOverdue"] if overdue else TEXTS["debtSoon"],
                    params={"number": o.number, "amount": Som(int(o.due)), "due": o.due_date.isoformat()},
                    payload={"orderId": str(o.id)},
                ),
            )
            if ok:
                sent += 1
        return sent


async def run_hourly() -> None:
    """Fon vazifasi: har soatda (birinchisi — ishga tushgandan bir soat keyin, setInterval kabi)"""
    while True:
        await asyncio.sleep(INTERVAL_SECONDS)
        try:
            await run()
        except Exception:
            log.exception("Nasiya eslatmalari xatosi")
