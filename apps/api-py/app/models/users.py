"""Foydalanuvchilar: profil, manzil, OTP, sessiya, qurilma."""

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, Boolean, Float, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CUSTOMER_TYPE, LOCALE, PAYMENT_METHOD, ROLE, Base, Tz, Uuid, created_at, fk, pk, updated_at, utcnow

# ───────────────────────── Foydalanuvchilar ─────────────────────────


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = pk()
    phone: Mapped[str] = mapped_column(Text, unique=True)
    full_name: Mapped[str | None] = mapped_column("full_name", Text)
    # scrypt; None — parol hali o'rnatilmagan. Hech qachon javobga tushmaydi
    password_hash: Mapped[str | None] = mapped_column("password_hash", Text)
    role: Mapped[str] = mapped_column(ROLE, default="CUSTOMER")
    locale: Mapped[str] = mapped_column(LOCALE, default="uz")
    is_active: Mapped[bool] = mapped_column("is_active", Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column("last_login_at", Tz)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()

    customer_profile: Mapped[CustomerProfile | None] = relationship(back_populates="user", lazy="raise", uselist=False)
    addresses: Mapped[list[Address]] = relationship(back_populates="user", lazy="raise")


class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    user_id: Mapped[str] = mapped_column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    type: Mapped[str] = mapped_column(CUSTOMER_TYPE, default="INDIVIDUAL")
    company_name: Mapped[str | None] = mapped_column("company_name", Text)
    inn: Mapped[str | None] = mapped_column(Text)
    bank_details: Mapped[Any | None] = mapped_column("bank_details", JSONB)
    price_group_id: Mapped[str | None] = fk("price_groups.id", nullable=True, name="price_group_id")
    credit_limit: Mapped[int] = mapped_column("credit_limit", BigInteger, default=0)
    payment_term_days: Mapped[int] = mapped_column("payment_term_days", Integer, default=0)
    allowed_payment_methods: Mapped[list[str]] = mapped_column(
        "allowed_payment_methods", ARRAY(PAYMENT_METHOD), default=lambda: ["CASH", "CARD_TRANSFER"]
    )
    # Ledger yig'indisi. Musbat = mijoz qarzdor, manfiy = haqdor
    balance_cached: Mapped[int] = mapped_column("balance_cached", BigInteger, default=0)
    updated_at: Mapped[datetime] = updated_at()

    user: Mapped[User] = relationship(back_populates="customer_profile", lazy="raise")
    price_group: Mapped[PriceGroup | None] = relationship(lazy="raise")


class PriceGroup(Base):
    __tablename__ = "price_groups"

    id: Mapped[str] = pk()
    name: Mapped[str] = mapped_column(Text, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()


class Address(Base):
    __tablename__ = "addresses"

    id: Mapped[str] = pk()
    user_id: Mapped[str] = fk("users.id", ondelete="CASCADE", name="user_id")
    label: Mapped[str | None] = mapped_column(Text)
    address_text: Mapped[str] = mapped_column("address_text", Text)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    floor: Mapped[int | None] = mapped_column(Integer)
    needs_loaders: Mapped[bool] = mapped_column("needs_loaders", Boolean, default=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()

    user: Mapped[User] = relationship(back_populates="addresses", lazy="raise")


class OtpCode(Base):
    __tablename__ = "otp_codes"

    id: Mapped[str] = pk()
    phone: Mapped[str] = mapped_column(Text)
    code_hash: Mapped[str] = mapped_column("code_hash", Text)
    expires_at: Mapped[datetime] = mapped_column("expires_at", Tz)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used_at: Mapped[datetime | None] = mapped_column("used_at", Tz)
    created_at: Mapped[datetime] = created_at()


class RefreshSession(Base):
    """Refresh token'lar. Token o'zi saqlanmaydi, faqat hash. Har refresh'da rotatsiya."""

    __tablename__ = "refresh_sessions"

    id: Mapped[str] = pk()
    user_id: Mapped[str] = fk("users.id", ondelete="CASCADE", name="user_id")
    token_hash: Mapped[str] = mapped_column("token_hash", Text, unique=True)
    # Bir login'dan tug'ilgan token'lar zanjiri. Eski token qayta ishlatilsa — butun oila bekor qilinadi
    family_id: Mapped[str] = mapped_column("family_id", Uuid)
    expires_at: Mapped[datetime] = mapped_column("expires_at", Tz)
    revoked_at: Mapped[datetime | None] = mapped_column("revoked_at", Tz)
    user_agent: Mapped[str | None] = mapped_column("user_agent", Text)
    created_at: Mapped[datetime] = created_at()

    user: Mapped[User] = relationship(lazy="raise")


class DeviceToken(Base):
    __tablename__ = "device_tokens"

    id: Mapped[str] = pk()
    user_id: Mapped[str] = fk("users.id", ondelete="CASCADE", name="user_id")
    token: Mapped[str] = mapped_column(Text, unique=True)
    platform: Mapped[str] = mapped_column(Text)
    last_seen_at: Mapped[datetime] = mapped_column("last_seen_at", Tz, default=utcnow)
