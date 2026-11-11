"""
Admin buyurtmalari.

    from app.modules.orders import admin
    await admin.detail(db, order_id, viewer)      # viewer: .role bor obyekt (AuthUser)
    await admin.list_orders(db, q) / admin.kanban(db, q) / admin.assign(...) / admin.managers(db)
"""

from app.modules.orders.admin_cards import KANBAN_LIMIT, KANBAN_STATUSES, kanban, list_orders
from app.modules.orders.admin_detail import assign, detail, managers

__all__ = ["KANBAN_STATUSES", "KANBAN_LIMIT", "list_orders", "kanban", "detail", "assign", "managers"]
