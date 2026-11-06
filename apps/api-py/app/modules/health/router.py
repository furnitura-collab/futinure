from sqlalchemy import text

from app.core.http import api_router
from app.core.redis import redis
from app.db import Db

router = api_router("/health", tags=["health"])


@router.get("")
async def health(db: Db):
    await db.execute(text("SELECT 1"))
    await redis().ping()
    return {"status": "ok"}
