def find(items: list[dict], key: str, value: str) -> dict:
    return next(i for i in items if i[key] == value)
