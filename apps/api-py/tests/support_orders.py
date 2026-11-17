"""Buyurtma jarayoni yordamchilari: savat → buyurtma, menejer o'tishlari, yetkazish"""

import uuid
from dataclasses import dataclass, replace
from types import SimpleNamespace
from typing import Any

from tests.support_ctx import Ctx
from tests.support_seed import UserCtx, seed_address, seed_catalog, seed_warehouse, user_with_token

API = "/api/v1"


@dataclass
class Cast:
    """Jarayon ishtirokchilari va katalog"""

    c: SimpleNamespace
    customer: UserCtx
    manager: UserCtx
    warehouse_user: UserCtx
    driver: UserCtx
    address_id: str
    warehouse_id: str


async def cast(ctx: Ctx) -> Cast:
    c = await seed_catalog(ctx)
    customer = await user_with_token(ctx, "CUSTOMER")
    address = await seed_address(ctx, customer.user.id)
    warehouse = await seed_warehouse(ctx)
    return Cast(
        c=c,
        customer=customer,
        manager=await user_with_token(ctx, "MANAGER"),
        warehouse_user=await user_with_token(ctx, "WAREHOUSE"),
        driver=await user_with_token(ctx, "DRIVER"),
        address_id=address.id,
        warehouse_id=warehouse.id,
    )


async def other_customer(ctx: Ctx, k: Cast) -> Cast:
    """Shu katalog va xodimlar, boshqa mijoz (o'z manzili bilan)"""
    customer = await user_with_token(ctx, "CUSTOMER")
    return replace(k, customer=customer, address_id=(await seed_address(ctx, customer.user.id)).id)


def ok(res: Any, status: int = 200) -> Any:
    assert res.status_code == status, f"{res.request.method} {res.request.url.path}: {res.status_code} {res.text}"
    return res.json() if res.content else None


async def place_order(ctx: Ctx, k: Cast, lines: list[tuple[str, int]], delivery: str = "DELIVERY") -> dict[str, Any]:
    """Mijoz savatga qo'shadi va buyurtma beradi"""
    for variant_id, qty in lines:
        ok(await ctx.http.put(f"{API}/cart/items/{variant_id}", headers=k.customer.auth, json={"qty": qty}))
    body: dict[str, Any] = {"deliveryType": delivery}
    body["addressId" if delivery == "DELIVERY" else "warehouseId"] = k.address_id if delivery == "DELIVERY" else k.warehouse_id
    headers = {**k.customer.auth, "Idempotency-Key": uuid.uuid4().hex}
    return ok(await ctx.http.post(f"{API}/orders", headers=headers, json=body), 201)


async def admin_order(ctx: Ctx, k: Cast, order_id: str) -> dict[str, Any]:
    return ok(await ctx.http.get(f"{API}/admin/orders/{order_id}", headers=k.manager.auth))


async def move(ctx: Ctx, who: UserCtx, order_id: str, to: str, status: int = 200, **extra: Any) -> Any:
    res = await ctx.http.post(f"{API}/admin/orders/{order_id}/transition", headers=who.auth, json={"to": to, **extra})
    assert res.status_code == status, f"→ {to}: {res.status_code} {res.text}"
    return res.json() if res.content else None


TERMS_ON_DELIVERY = {"paymentTerms": "ON_DELIVERY", "allowedMethods": ["CASH"], "deliveryFee": 60_000}


async def accept(ctx: Ctx, k: Cast, order_id: str, terms: dict[str, Any] | None = None) -> Any:
    return await move(ctx, k.manager, order_id, "PREPARING", terms=terms or TERMS_ON_DELIVERY)


async def assign_driver(ctx: Ctx, k: Cast, order_id: str) -> Any:
    return ok(
        await ctx.http.put(f"{API}/admin/orders/{order_id}/delivery", headers=k.manager.auth, json={"driverId": k.driver.user.id})
    )
