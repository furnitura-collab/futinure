"""scrypt, "salt:hash" (hex). Node crypto.scrypt standartlari (N=16384, r=8, p=1) — eski parollar mos."""

import hashlib
import hmac
import os

import anyio

KEY_LEN = 64


def _scrypt(password: str, salt: bytes, length: int) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, maxmem=64 * 1024 * 1024, dklen=length)


async def hash_password(password: str) -> str:
    salt = os.urandom(16)
    key = await anyio.to_thread.run_sync(_scrypt, password, salt, KEY_LEN)
    return f"{salt.hex()}:{key.hex()}"


async def verify_password(password: str, stored: str) -> bool:
    salt_hex, _, key_hex = stored.partition(":")
    if not salt_hex or not key_hex:
        return False
    expected = bytes.fromhex(key_hex)
    actual = await anyio.to_thread.run_sync(_scrypt, password, bytes.fromhex(salt_hex), len(expected))
    return hmac.compare_digest(expected, actual)
