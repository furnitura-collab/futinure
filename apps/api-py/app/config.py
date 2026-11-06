"""Env — NestJS env.ts bilan bir xil nomlar, standartlar va tekshiruvlar (deploy/.env o'zgarmaydi)."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from app.domain.phone import normalize_uz_phone


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    NODE_ENV: Literal["development", "test", "production"] = "development"
    PORT: int = 3000
    DATABASE_URL: str
    REDIS_URL: str
    JWT_ACCESS_SECRET: str = Field(min_length=32)
    JWT_ACCESS_TTL: str = "15m"
    REFRESH_TTL_DAYS: int = Field(default=30, gt=0)
    OTP_PEPPER: str = Field(min_length=32)
    SMS_PROVIDER: Literal["console", "eskiz"] = "console"
    ESKIZ_EMAIL: str | None = None
    ESKIZ_PASSWORD: str | None = None
    ESKIZ_FROM: str = "4546"
    OTP_TEST_PHONES: Annotated[list[str], NoDecode] = Field(default_factory=list)
    UPLOAD_DIR: str = "./uploads"
    # Berilsa fayllar diskka emas, Supabase Storage'ga yoziladi (Render kabi vaqtinchalik diskli hosting)
    SUPABASE_URL: str | None = None
    SUPABASE_SERVICE_KEY: str | None = None
    # Push: "console" (dev, logga) yoki "expo"
    PUSH_PROVIDER: Literal["console", "expo"] = "console"
    EXPO_ACCESS_TOKEN: str | None = None
    # Telegram bot — xodimlar guruhiga xabar. Bo'sh bo'lsa o'chiq
    TELEGRAM_BOT_TOKEN: str | None = None
    TELEGRAM_CHAT_ID: str | None = None
    # Telegram xabaridagi havolalar uchun
    ADMIN_URL: str = "http://localhost:3001"
    # Sinov serveri: production'da ham console SMS va test raqamlarga ruxsat
    DEMO_MODE: bool = False
    # Build qilingan web fayllar (admin/ va app/). Berilsa API ularni o'zi beradi
    WEB_DIR: str | None = None

    @field_validator(
        "ESKIZ_EMAIL",
        "ESKIZ_PASSWORD",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_KEY",
        "EXPO_ACCESS_TOKEN",
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_CHAT_ID",
        "WEB_DIR",
        mode="before",
    )
    @classmethod
    def _empty_is_none(cls, v: object) -> object:
        return None if v == "" else v

    @field_validator("DEMO_MODE", mode="before")
    @classmethod
    def _demo(cls, v: object) -> object:
        if v in ("", None):
            return False
        if v not in ("true", "false", True, False):
            raise ValueError("true yoki false")
        return v in ("true", True)

    @field_validator("OTP_TEST_PHONES", mode="before")
    @classmethod
    def _phones(cls, v: object) -> object:
        if isinstance(v, str):
            return [p for p in (normalize_uz_phone(x) for x in v.split(",")) if p]
        return v

    @model_validator(mode="after")
    def _check(self) -> Settings:
        errors: list[str] = []
        if self.NODE_ENV == "production" and not self.DEMO_MODE:
            if self.SMS_PROVIDER == "console":
                errors.append("SMS_PROVIDER: production uchun haqiqiy SMS provayder kerak")
            if self.OTP_TEST_PHONES:
                errors.append("OTP_TEST_PHONES: production'da test raqamlar bo'lmasligi kerak")
            if self.JWT_ACCESS_SECRET.startswith("change-me"):
                errors.append("JWT_ACCESS_SECRET: default secret ishlatilmoqda")
        if bool(self.TELEGRAM_BOT_TOKEN) != bool(self.TELEGRAM_CHAT_ID):
            errors.append("TELEGRAM_CHAT_ID: TELEGRAM_BOT_TOKEN va TELEGRAM_CHAT_ID birga beriladi")
        if bool(self.SUPABASE_URL) != bool(self.SUPABASE_SERVICE_KEY):
            errors.append("SUPABASE_SERVICE_KEY: SUPABASE_URL va SUPABASE_SERVICE_KEY birga beriladi")
        if self.SMS_PROVIDER == "eskiz" and not (self.ESKIZ_EMAIL and self.ESKIZ_PASSWORD):
            errors.append("ESKIZ_EMAIL: Eskiz login ma'lumotlari kerak")
        if errors:
            raise ValueError("Env xato:\n  " + "\n  ".join(errors))
        return self

    @property
    def access_ttl_seconds(self) -> int:
        units = {"s": 1, "m": 60, "h": 3600, "d": 86400}
        v = self.JWT_ACCESS_TTL.strip()
        return int(v[:-1]) * units[v[-1]] if v[-1] in units else int(v)

    @property
    def async_database_url(self) -> str:
        url = self.DATABASE_URL.split("?")[0]
        return url.replace("postgresql://", "postgresql+asyncpg://", 1).replace("postgres://", "postgresql+asyncpg://", 1)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
