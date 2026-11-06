"""Kategoriya daraxti"""

from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category


async def category_with_descendants(db: AsyncSession, root_id: str) -> list[str]:
    """Kategoriya va uning barcha avlodlari id'lari (kategoriyalar soni kam — xotirada hisoblaymiz)"""
    rows = (await db.execute(select(Category.id, Category.parent_id))).all()
    return collect_descendants([(r.id, r.parent_id) for r in rows], root_id)


def collect_descendants(rows: Iterable[tuple[str, str | None]], root_id: str) -> list[str]:
    children: dict[str, list[str]] = {}
    for id_, parent_id in rows:
        if parent_id:
            children.setdefault(parent_id, []).append(id_)
    result: list[str] = []
    stack = [root_id]
    while stack:
        id_ = stack.pop()
        if id_ in result:
            continue
        result.append(id_)
        stack.extend(children.get(id_, []))
    return result


def would_create_cycle(rows: Iterable[tuple[str, str | None]], id_: str, new_parent_id: str | None) -> bool:
    """parentId'ni o'zgartirish sikl hosil qilmasligi kerak"""
    return new_parent_id is not None and new_parent_id in collect_descendants(rows, id_)


def build_tree(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """rows: {"id", "parentId", ...} — har tugunga "children" qo'shiladi"""
    nodes = {r["id"]: {**r, "children": []} for r in rows}
    roots: list[dict[str, Any]] = []
    for node in nodes.values():
        parent = nodes.get(node["parentId"]) if node["parentId"] else None
        if parent is not None:
            parent["children"].append(node)
        else:
            roots.append(node)
    return roots
