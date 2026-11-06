"""
Bildirishnomalar API, outbox dispatcher va nasiya eslatmalari.
Fon vazifalari (testda o'chiq): outbox har 0.5 s, eslatmalar har soat.
"""

from typing import Annotated

from pydantic import Field, StrictBool, model_validator

from app.auth.deps import CurrentUser
from app.core.http import api_router
from app.core.schemas import PageQuery, Schema, Uuid, custom_error
from app.db import Db
from app.modules.notifications import debt_reminders, dispatcher, service

router = api_router("/notifications", tags=["notifications"])


class NotificationsRead(Schema):
    ids: Annotated[list[Uuid], Field(max_length=200)] | None = None
    all: StrictBool | None = None

    @model_validator(mode="after")
    def _ids_or_all(self) -> NotificationsRead:
        if not (self.all or self.ids):
            raise custom_error("IDS_OR_ALL_REQUIRED")
        return self


@router.get("")
async def list_notifications(u: CurrentUser, q: PageQuery, db: Db):
    return await service.list_notifications(db, u.id, q.page, q.limit)


@router.post("/read")
async def read(u: CurrentUser, body: NotificationsRead, db: Db):
    return await service.mark_read(db, u.id, None if body.all else body.ids)


background_tasks = [dispatcher.run_forever, debt_reminders.run_hourly]
