"""
Tashqi yuborish: SMS (Eskiz), push (Expo), Telegram. Provayder env bo'yicha tanlanadi.
Testlarda override_senders() bilan fake'lar qo'yiladi.
"""

import logging
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Protocol

import httpx

from app.config import get_settings
from app.core.redis import redis

log = logging.getLogger("senders")


# ───────────────────────── SMS ─────────────────────────


class SmsSender(Protocol):
    async def send(self, phone: str, text: str) -> None: ...


class ConsoleSms:
    """Dev: SMS yubormaydi, logga chiqaradi"""

    async def send(self, phone: str, text: str) -> None:
        log.info("SMS %s: %s", phone, text)


class EskizSms:
    """
    Eskiz.uz. Diqqat: Eskiz faqat oldindan tasdiqlangan shablonli matnlarni yuboradi,
    OTP matni kabinetda shablon sifatida tasdiqlangan bo'lishi kerak.
    """

    BASE = "https://notify.eskiz.uz/api"
    TOKEN_KEY = "eskiz:token"

    async def send(self, phone: str, text: str) -> None:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await self._post(client, phone, text, await self._token(client))
            if res.status_code == 401:
                res = await self._post(client, phone, text, await self._token(client, force=True))
            if res.is_error:
                log.error("SMS yuborilmadi %s: %s", res.status_code, res.text)
                raise RuntimeError("SMS_SEND_FAILED")

    async def _post(self, client: httpx.AsyncClient, phone: str, text: str, token: str) -> httpx.Response:
        env = get_settings()
        data = {"mobile_phone": phone.replace("+", ""), "message": text, "from": env.ESKIZ_FROM}
        return await client.post(f"{self.BASE}/message/sms/send", headers={"Authorization": f"Bearer {token}"}, data=data)

    async def _token(self, client: httpx.AsyncClient, force: bool = False) -> str:
        if not force:
            cached = await redis().get(self.TOKEN_KEY)
            if cached:
                return cached
        env = get_settings()
        res = await client.post(
            f"{self.BASE}/auth/login", data={"email": env.ESKIZ_EMAIL or "", "password": env.ESKIZ_PASSWORD or ""}
        )
        if res.is_error:
            raise RuntimeError(f"Eskiz login xato: {res.status_code}")
        token = (res.json().get("data") or {}).get("token")
        if not token:
            raise RuntimeError("Eskiz token qaytarmadi")
        # Token 30 kun amal qiladi, biz 25 kun saqlaymiz
        await redis().set(self.TOKEN_KEY, token, ex=25 * 24 * 3600)
        return token


# ───────────────────────── Push ─────────────────────────


@dataclass
class PushMessage:
    to: str
    title: str
    body: str
    data: dict[str, Any] = field(default_factory=dict)


class PushSender(Protocol):
    async def send(self, messages: list[PushMessage]) -> list[str]:
        """Qaytaradi: endi yaroqsiz tokenlar (ilova o'chirilgan) — bazadan o'chiriladi"""
        ...


class ConsolePush:
    async def send(self, messages: list[PushMessage]) -> list[str]:
        for m in messages:
            log.info("Push %s…: %s — %s", m.to[:24], m.title, m.body)
        return []


class ExpoPush:
    """Expo Push API: https://docs.expo.dev/push-notifications/sending-notifications/"""

    URL = "https://exp.host/--/api/v2/push/send"
    CHUNK = 100

    async def send(self, messages: list[PushMessage]) -> list[str]:
        token = get_settings().EXPO_ACCESS_TOKEN
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        invalid: list[str] = []
        async with httpx.AsyncClient(timeout=10) as client:
            for i in range(0, len(messages), self.CHUNK):
                chunk = messages[i : i + self.CHUNK]
                body = [{**_push_json(m), "sound": "default", "channelId": "default"} for m in chunk]
                res = await client.post(self.URL, headers=headers, json=body)
                if res.is_error:
                    log.error("Expo %s: %s", res.status_code, res.text)
                    continue
                for idx, ticket in enumerate(res.json().get("data") or []):
                    if ticket.get("status") == "error" and (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                        invalid.append(chunk[idx].to)
        return invalid


def _push_json(m: PushMessage) -> dict[str, Any]:
    d = asdict(m)
    if not d["data"]:
        d.pop("data")
    return d


# ───────────────────────── Telegram ─────────────────────────


class TelegramSender(Protocol):
    async def send(self, html: str) -> None: ...


class ConsoleTelegram:
    async def send(self, html: str) -> None:
        log.info("Telegram: %s", re.sub(r"<[^>]+>", "", html))


class BotTelegram:
    async def send(self, html: str) -> None:
        env = get_settings()
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                f"https://api.telegram.org/bot{env.TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": env.TELEGRAM_CHAT_ID, "text": html, "parse_mode": "HTML", "disable_web_page_preview": True},
            )
            if res.is_error:
                log.error("Telegram %s: %s", res.status_code, res.text)


def escape_html(s: str) -> str:
    """Telegram HTML uchun foydalanuvchi matnini ekranlash"""
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ───────────────────────── Tanlash ─────────────────────────

# Testlar o'z fake'larini qo'yadi (tests/conftest.py) — tashqi xizmatlarga hech narsa ketmaydi
_overrides: dict[str, Any] = {}


def override_senders(*, sms: Any = None, push: Any = None, telegram: Any = None) -> None:
    _overrides.clear()
    _overrides.update({k: v for k, v in (("sms", sms), ("push", push), ("telegram", telegram)) if v is not None})


def sms_sender() -> SmsSender:
    if "sms" in _overrides:
        return _overrides["sms"]
    return EskizSms() if get_settings().SMS_PROVIDER == "eskiz" else ConsoleSms()


def push_sender() -> PushSender:
    if "push" in _overrides:
        return _overrides["push"]
    return ExpoPush() if get_settings().PUSH_PROVIDER == "expo" else ConsolePush()


def telegram_sender() -> TelegramSender:
    if "telegram" in _overrides:
        return _overrides["telegram"]
    return BotTelegram() if get_settings().TELEGRAM_BOT_TOKEN else ConsoleTelegram()
