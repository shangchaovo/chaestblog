#!/usr/bin/env python3
"""给 assets/ 下的 JPG/PNG 生成同名 WebP。加了新截图就重跑一次。

页面用 <picture> 优先取 WebP，JPG 留作老浏览器兜底，所以两份都要在。
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [ROOT / "assets" / "shots"]
QUALITY = 80


def main() -> int:
    total_before = 0
    total_after = 0
    for folder in TARGETS:
        for source in sorted(folder.glob("*.jpg")) + sorted(folder.glob("*.png")):
            out = source.with_suffix(".webp")
            with Image.open(source) as image:
                image.convert("RGB").save(out, "WEBP", quality=QUALITY, method=6)
            before = source.stat().st_size
            after = out.stat().st_size
            total_before += before
            total_after += after
            print(f"{source.relative_to(ROOT)} {before // 1024}K -> {out.suffix[1:]} {after // 1024}K")
    if total_before:
        saved = 100 - round(total_after / total_before * 100)
        print(f"total {total_before // 1024}K -> {total_after // 1024}K ({saved}% smaller)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
