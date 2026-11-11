"""Demo ma'lumotlar: foydalanuvchilar, kategoriyalar, mahsulotlar, transport, sozlamalar."""

# ruff: noqa: E501

from decimal import Decimal
from typing import Any

USERS = [
    ("+998900000001", "Super Admin", "SUPER_ADMIN"),
    ("+998900000002", "Menejer ", "MANAGER"),
    ("+998900000003", "Omborchi ", "WAREHOUSE"),
    ("+998900000004", "Haydovchi ", "DRIVER"),
    ("+998900000005", "Usta ", "CUSTOMER"),
]

CATEGORIES: list[dict[str, str]] = [
    {"slug": "plitalar", "nameUz": "Plitalar", "nameRu": "Плиты"},
    {"slug": "ldsp", "nameUz": "LDSP", "nameRu": "ЛДСП", "parent": "plitalar"},
    {"slug": "mdf", "nameUz": "MDF", "nameRu": "МДФ", "parent": "plitalar"},
    {"slug": "kromka", "nameUz": "Kromka", "nameRu": "Кромка"},
    {"slug": "furnitura", "nameUz": "Furnitura", "nameRu": "Фурнитура"},
    {"slug": "petlya", "nameUz": "Petlyalar", "nameRu": "Петли", "parent": "furnitura"},
    {"slug": "yonaltiruvchi", "nameUz": "Yo'naltiruvchilar", "nameRu": "Направляющие", "parent": "furnitura"},
    {"slug": "ruchka", "nameUz": "Ruchkalar", "nameRu": "Ручки", "parent": "furnitura"},
    {"slug": "mahkamlagich", "nameUz": "Mahkamlagichlar", "nameRu": "Крепёж"},
]

BOARD_16 = {"length": 2800, "width": 2070, "thickness": 16}

PRODUCTS: list[dict[str, Any]] = [
    {
        "code": "LDSP-KR-16", "category": "ldsp", "brand": "Kronospan",
        "nameUz": "LDSP Kronospan 16 mm", "nameRu": "ЛДСП Kronospan 16 мм",
        "unit": "SHEET", "kind": "BOARD", "weightKg": 45, "volumeM3": "0.092", "board": BOARD_16,
        "variants": [
            {"sku": "KR-W980-16", "attributes": {"color": "Oq", "decor_code": "W980", "thickness": 16}, "price": 395_000,
             "stock": 120, "tiers": [(10, 385_000), (50, 375_000)], "usta": 380_000, "diler": 368_000},
            {"sku": "KR-K001-16", "attributes": {"color": "Yong'oq", "decor_code": "K001", "thickness": 16}, "price": 445_000,
             "stock": 40, "tiers": [(10, 435_000)], "usta": 430_000},
            {"sku": "KR-0190-16", "attributes": {"color": "Qora", "decor_code": "0190", "thickness": 16}, "price": 420_000, "stock": 6},
        ],
    },
    {
        "code": "LDSP-EG-18", "category": "ldsp", "brand": "Egger",
        "nameUz": "LDSP Egger 18 mm", "nameRu": "ЛДСП Egger 18 мм",
        "unit": "SHEET", "kind": "BOARD", "weightKg": 52, "volumeM3": "0.104",
        "board": {"length": 2800, "width": 2070, "thickness": 18},
        "variants": [
            {"sku": "EG-H1145-18", "attributes": {"color": "Bardolino eman", "decor_code": "H1145", "thickness": 18},
             "price": 610_000, "stock": 25},
            {"sku": "EG-U999-18", "attributes": {"color": "Qora", "decor_code": "U999", "thickness": 18}, "price": 590_000, "stock": 0},
        ],
    },
    {
        "code": "MDF-16", "category": "mdf",
        "nameUz": "MDF 16 mm (bo'yalmagan)", "nameRu": "МДФ 16 мм (некрашеный)",
        "unit": "SHEET", "kind": "BOARD", "weightKg": 55, "volumeM3": "0.094", "board": BOARD_16,
        "variants": [{"sku": "MDF-16", "attributes": {"thickness": 16}, "price": 340_000, "stock": 60}],
    },
    {
        "code": "KROMKA-PVX-RH", "category": "kromka", "brand": "Rehau",
        "nameUz": "PVX kromka 2 mm", "nameRu": "Кромка ПВХ 2 мм",
        "unit": "METER", "kind": "EDGE", "minQty": 1, "qtyStep": "0.5", "weightKg": "0.05", "volumeM3": "0.0001",
        "variants": [
            {"sku": "RH-2-W980", "attributes": {"color": "Oq", "decor_code": "W980", "thickness": 2, "width": 22}, "price": 4_500,
             "stock": 3000, "tiers": [(100, 4_200)]},
            {"sku": "RH-2-K001", "attributes": {"color": "Yong'oq", "decor_code": "K001", "thickness": 2, "width": 22},
             "price": 5_000, "stock": 1200},
            {"sku": "RH-04-W980", "attributes": {"color": "Oq", "decor_code": "W980", "thickness": 0.4, "width": 19},
             "price": 1_500, "stock": 5000},
        ],
    },
    {
        "code": "PETLYA-BLUM", "category": "petlya", "brand": "Blum",
        "nameUz": "Petlya Blum Clip top (dovodchikli)", "nameRu": "Петля Blum Clip top (с доводчиком)",
        "unit": "PIECE", "minQty": 2, "qtyStep": 2, "weightKg": "0.12", "volumeM3": "0.0002",
        "variants": [{"sku": "BLUM-71B3550", "attributes": {"angle": "110°"}, "price": 48_000, "stock": 400,
                      "tiers": [(50, 45_000)], "usta": 46_000}],
    },
    {
        "code": "PETLYA-GTV", "category": "petlya", "brand": "GTV",
        "nameUz": "Petlya GTV (dovodchikli)", "nameRu": "Петля GTV (с доводчиком)",
        "unit": "PIECE", "minQty": 2, "qtyStep": 2, "weightKg": "0.1", "volumeM3": "0.0002",
        "variants": [{"sku": "GTV-PB-110", "attributes": {"angle": "110°"}, "price": 14_000, "stock": 1500, "tiers": [(100, 12_500)]}],
    },
    {
        "code": "YONALT-GTV", "category": "yonaltiruvchi", "brand": "GTV",
        "nameUz": "Sharikli yo'naltiruvchi", "nameRu": "Шариковые направляющие",
        "unit": "SET", "weightKg": "0.9", "volumeM3": "0.002",
        "variants": [
            {"sku": "GTV-SL-350", "attributes": {"length": 350}, "price": 38_000, "stock": 200},
            {"sku": "GTV-SL-450", "attributes": {"length": 450}, "price": 45_000, "stock": 180},
            {"sku": "GTV-SL-500", "attributes": {"length": 500}, "price": 49_000, "stock": 0},
        ],
    },
    {
        "code": "RUCHKA-128", "category": "ruchka",
        "nameUz": "Ruchka profil 128 mm", "nameRu": "Ручка профиль 128 мм",
        "unit": "PIECE", "weightKg": "0.06", "volumeM3": "0.0001",
        "variants": [
            {"sku": "RCH-128-BLK", "attributes": {"color": "Qora", "length": 128}, "price": 18_000, "stock": 300},
            {"sku": "RCH-128-GLD", "attributes": {"color": "Oltin", "length": 128}, "price": 22_000, "stock": 120},
        ],
    },
    {
        "code": "KONFIRMAT-7x50", "category": "mahkamlagich",
        "nameUz": "Konfirmat 7×50", "nameRu": "Конфирмат 7×50",
        "unit": "PACK", "weightKg": "1.1", "volumeM3": "0.001",
        "variants": [{"sku": "KONF-7x50-100", "attributes": {"pack": "100 dona"}, "price": 35_000, "stock": 90}],
    },
]  # fmt: skip

VEHICLES = [
    {
        "code": "DAMAS",
        "name": "Damas",
        "max_weight_kg": 500,
        "max_volume_m3": Decimal("2.5"),
        "max_length_mm": 1900,
        "sort_order": 1,
    },
    {"code": "LABO", "name": "Labo", "max_weight_kg": 800, "max_volume_m3": Decimal(4), "max_length_mm": 2900, "sort_order": 2},
    {
        "code": "ISUZU",
        "name": "Isuzu",
        "max_weight_kg": 3500,
        "max_volume_m3": Decimal(18),
        "max_length_mm": 4300,
        "sort_order": 3,
    },
]

SETTINGS: dict[str, Any] = {
    "payment.card": {"number": "8600 0000 0000 0000", "holder": "MEBEL ORDER MCHJ"},
    "payment.bank": {"name": "Kapitalbank", "account": "20208000000000000001", "mfo": "01158", "inn": "300000000"},
    "cutting.price_per_meter": 3_000,
    "cutting.edging_price_per_meter": 2_500,
}
