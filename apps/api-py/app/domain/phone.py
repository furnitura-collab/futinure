import re

UZ_PHONE_RE = re.compile(r"^\+998[1-9]\d{8}$")


def normalize_uz_phone(value: str) -> str | None:
    """
    O'zbekiston raqamini +998XXXXXXXXX ko'rinishiga keltiradi.
    Qabul qiladi: "+998 90 123 45 67", "998901234567", "90 123-45-67", "(90) 1234567".
    """
    digits = re.sub(r"\D", "", value)
    if len(digits) == 12 and digits.startswith("998"):
        local = digits[3:]
    elif len(digits) == 9:
        local = digits
    else:
        return None
    # Operator kodi 0 bilan boshlanmaydi
    if local.startswith("0"):
        return None
    return f"+998{local}"
