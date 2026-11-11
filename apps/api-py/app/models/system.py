"""Kommunikatsiya va tizim: chat, bildirishnoma, audit, fayl, outbox, sozlama."""

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, Tz, Uuid, created_at, fk, pk, updated_at, utcnow

if TYPE_CHECKING:
    from app.models.users import User

# ───────────────────────── Kommunikatsiya va tizim ─────────────────────────


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = pk()
    order_id: Mapped[str] = fk("orders.id", ondelete="CASCADE", name="order_id")
    sender_id: Mapped[str] = fk("users.id", name="sender_id")
    text: Mapped[str | None] = mapped_column(Text)
    attachment_upload_id: Mapped[str | None] = mapped_column("attachment_upload_id", Uuid, ForeignKey("uploads.id"), unique=True)
    read_by_customer_at: Mapped[datetime | None] = mapped_column("read_by_customer_at", Tz)
    read_by_staff_at: Mapped[datetime | None] = mapped_column("read_by_staff_at", Tz)
    created_at: Mapped[datetime] = created_at()

    sender: Mapped[User] = relationship(lazy="raise")
    attachment: Mapped[Upload | None] = relationship(lazy="raise")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = pk()
    user_id: Mapped[str] = fk("users.id", ondelete="CASCADE", name="user_id")
    # Qaysi outbox hodisasidan — qayta ishlashda dublikat bo'lmasin
    event_id: Mapped[str | None] = mapped_column("event_id", Uuid)
    type: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    payload: Mapped[Any] = mapped_column(JSONB, default=dict)
    read_at: Mapped[datetime | None] = mapped_column("read_at", Tz)
    created_at: Mapped[datetime] = created_at()


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = pk()
    actor_id: Mapped[str | None] = fk("users.id", nullable=True, name="actor_id")
    entity: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[str] = mapped_column("entity_id", Text)
    action: Mapped[str] = mapped_column(Text)
    before: Mapped[Any | None] = mapped_column(JSONB)
    after: Mapped[Any | None] = mapped_column(JSONB)
    ip: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()


class Upload(Base):
    """Yopiq fayllar (to'lov cheklari). Statik berilmaydi — faqat ruxsat tekshiruvi bilan"""

    __tablename__ = "uploads"

    id: Mapped[str] = pk()
    owner_id: Mapped[str] = fk("users.id", name="owner_id")
    purpose: Mapped[str] = mapped_column(Text)
    storage_path: Mapped[str] = mapped_column("storage_path", Text)
    mime_type: Mapped[str] = mapped_column("mime_type", Text)
    size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = created_at()


class OutboxEvent(Base):
    """Transactional outbox: hodisa o'zgarish bilan bir tranzaksiyada yoziladi, dispatcher tarqatadi"""

    __tablename__ = "outbox_events"

    id: Mapped[str] = pk()
    type: Mapped[str] = mapped_column(Text)
    payload: Mapped[Any] = mapped_column(JSONB)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column("last_error", Text)
    next_attempt_at: Mapped[datetime] = mapped_column("next_attempt_at", Tz, default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column("processed_at", Tz)
    created_at: Mapped[datetime] = created_at()


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = updated_at()
