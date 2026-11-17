"""Phosphor ikonkalari: faqat ishlatiladiganlari (scripts/icons.txt) kichik shriftga ajratiladi.

Native modul (react-native-svg) kerak emas — shrift expo-font bilan yuklanadi va OTA yangilanishga kiradi.
Ishga tushirish (apps/mobile ichida):
    uv run --with fonttools python scripts/build_icons.py
"""

import re
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules/@phosphor-icons/web/src"
WEIGHTS = {"regular": "Phosphor", "fill": "Phosphor-Fill"}
OUT_FONTS = ROOT / "assets/fonts"
OUT_TS = ROOT / "src/components/ui/glyphs.ts"


def codepoints(css: str) -> dict[str, int]:
    return {m[1]: int(m[2], 16) for m in re.finditer(r"\.ph-([a-z0-9-]+):before\s*\{\s*content:\s*\"\\([0-9a-f]+)\"", css)}


def main() -> None:
    names = [n.strip() for n in (ROOT / "scripts/icons.txt").read_text().splitlines() if n.strip()]
    glyphs = codepoints((SRC / "regular/style.css").read_text())
    missing = [n for n in names if n not in glyphs]
    if missing:
        raise SystemExit(f"Phosphor'da yo'q: {', '.join(missing)}")

    unicodes = [glyphs[n] for n in names]
    OUT_FONTS.mkdir(parents=True, exist_ok=True)
    for weight, file in WEIGHTS.items():
        opts = subset.Options()
        opts.layout_features = []
        font = subset.load_font(str(SRC / weight / f"{file}.ttf"), opts)
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=unicodes)
        sub.subset(font)
        subset.save_font(font, str(OUT_FONTS / f"phosphor-{weight}.ttf"), opts)

    rows = "\n".join(f"  '{n}': {glyphs[n]}," for n in sorted(names))
    OUT_TS.write_text(
        "// Avtomatik: scripts/build_icons.py — qo'lda o'zgartirilmaydi, scripts/icons.txt ga nom qo'shing\n"
        f"export const GLYPHS = {{\n{rows}\n}} as const;\n\nexport type IconName = keyof typeof GLYPHS;\n"
    )
    print(f"{len(names)} ta ikonka → {OUT_FONTS.relative_to(ROOT)}, {OUT_TS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
