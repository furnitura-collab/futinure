"""exit 0 — bazada foydalanuvchi yo'q (seed kerak), 1 — bor"""

import asyncio
import sys

from sqlalchemy import func, select

from app.db import dispose, standalone_session
from app.models import User


async def main() -> int:
    async with standalone_session() as db:
        n = await db.scalar(select(func.count()).select_from(User))
    await dispose()
    return 0 if n == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
