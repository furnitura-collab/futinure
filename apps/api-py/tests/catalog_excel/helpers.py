import io

from openpyxl import Workbook

from tests.support import Ctx

Row = dict[str, str | int | float]


XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def xlsx(rows: list[Row], columns: list[str] | None = None) -> bytes:
    cols = columns or list(dict.fromkeys(k for r in rows for k in r))
    wb = Workbook()
    ws = wb.active
    ws.title = "Mahsulotlar"
    ws.append(cols)
    for r in rows:
        ws.append([r.get(c) for c in cols])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def kromka(**over: str | int | float) -> Row:
    return {
        "product_code": "KROMKA-2",
        "category_slug": "furnitura",
        "brand": "Rehau",
        "name_uz": "PVX kromka 2 mm",
        "name_ru": "Кромка ПВХ 2 мм",
        "unit": "meter",
        "kind": "EDGE",
        "qty_step": "0,5",
        "sku": "RH-2-W980",
        "price": "4 500",
        "stock": 3000,
        "attr:color": "Oq",
        "attr:width": 22,
        "group:Usta": 4300,
        "tier1_qty": 100,
        "tier1_price": 4200,
        **over,
    }


async def upload(ctx: Ctx, auth: dict[str, str], buf: bytes, commit: bool = False):
    return await ctx.http.post(
        f"/api/v1/admin/catalog/import?commit={'true' if commit else 'false'}",
        headers=auth,
        files={"file": ("katalog.xlsx", buf, XLSX_MIME)},
    )
