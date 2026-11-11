import asyncio
import socket
from collections.abc import AsyncIterator, Awaitable, Callable
from types import SimpleNamespace
from typing import Any

import pytest
import socketio
import uvicorn

from app.models import DeviceToken
from tests.notifications.helpers import NS
from tests.support import Ctx, seed_catalog, seed_warehouse, user_with_token


@pytest.fixture
async def s(ctx: Ctx) -> SimpleNamespace:
    """beforeEach: katalog, mijoz (push tokeni bilan), menejer, ombor"""
    c = await seed_catalog(ctx)
    customer = await user_with_token(ctx, "CUSTOMER")
    manager_user = await user_with_token(ctx, "MANAGER")
    warehouse_id = (await seed_warehouse(ctx)).id
    await ctx.add(DeviceToken(user_id=customer.user.id, token="ExponentPushToken[mijoz]", platform="ios"))
    return SimpleNamespace(
        ctx=ctx, c=c, customer=customer, manager_user=manager_user, manager=manager_user.auth, warehouse_id=warehouse_id
    )


# ───── haqiqiy HTTP server (Socket.IO uchun) ─────


@pytest.fixture(scope="module")
async def server_url() -> AsyncIterator[str]:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    # lifespan="off": to'xtatilganda umumiy DB/Redis ulanishlari yopilmasin
    server = uvicorn.Server(uvicorn.Config("app.main:app", host="127.0.0.1", port=port, log_level="warning", lifespan="off"))
    task = asyncio.create_task(server.serve())
    for _ in range(200):
        if server.started:
            break
        await asyncio.sleep(0.02)
    assert server.started, "uvicorn ishga tushmadi"
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    await task


@pytest.fixture
async def connect(server_url: str) -> AsyncIterator[Callable[..., Awaitable[socketio.AsyncClient]]]:
    clients: list[socketio.AsyncClient] = []

    async def _connect(token: str | None = None) -> socketio.AsyncClient:
        client = socketio.AsyncClient(reconnection=False)
        clients.append(client)
        ready: asyncio.Future[Any] = asyncio.get_running_loop().create_future()

        def on_ready(data: Any) -> None:
            if not ready.done():
                ready.set_result(data)

        client.on("ready", on_ready, namespace=NS)
        await client.connect(
            server_url, namespaces=[NS], auth={"token": token} if token else {}, transports=["websocket"], wait_timeout=3
        )
        await asyncio.wait_for(ready, 3)
        return client

    yield _connect
    for client in clients:
        if client.connected:
            await client.disconnect()
