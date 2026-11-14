"""The link-preview image (site/og.png, 1200 x 630): the title and three headline figures from the
current edition's table. Re-run after each edition (needs Playwright with Chromium):

    python tools/og_image.py"""

from __future__ import annotations

import csv
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def figures() -> dict:
    cfg = tomllib.loads((ROOT / "config" / "methodology.toml").read_text(encoding="utf-8"))
    edition = cfg["meta"]["edition"]
    rows = [r for r in csv.DictReader((ROOT / "data" / "editions" / f"{edition}.csv").open(encoding="utf-8")) if r["rank"]]
    top = {t for _, t, _ in cfg["tiers"]["cutoffs"]}
    stages = cfg["tiers"]["stages"]
    return {"edition": edition, "n": len(rows), "top": sum(1 for r in rows if r["tier"] in top),
            "none": sum(1 for r in rows if r["tier"] == stages[-1][1]),
            "shares": [(t, sum(1 for r in rows if r["tier"] == t) / len(rows)) for t in
                       [c[1] for c in cfg["tiers"]["cutoffs"]] + [s[1] for s in stages]]}


COLORS = ["#1c5cab", "#4b8fd9", "#9cc4f0", "#f2b27a", "#e07b36", "#b4481a", "#b9c1bd"]


def html(f: dict) -> str:
    bar = "".join(f'<i style="flex:{max(s, 0.004):.4f};background:{c}"></i>' for (_, s), c in zip(f["shares"], COLORS))
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
    body {{ margin: 0; width: 1200px; height: 630px; background: #f5f7f6; color: #16201d;
           font-family: "Inter Display", Inter, sans-serif; display: flex; flex-direction: column; justify-content: space-between;
           padding: 64px 72px 56px; box-sizing: border-box; border-top: 14px solid #1c5cab; }}
    .eyebrow {{ font: 500 22px "DejaVu Sans Mono", monospace; letter-spacing: .08em; color: #5b6763; text-transform: uppercase; }}
    h1 {{ font-weight: 800; font-size: 76px; line-height: 1.02; letter-spacing: -.02em; margin: 18px 0 0; max-width: 1000px; }}
    p {{ font-size: 28px; color: #5b6763; margin: 18px 0 0; max-width: 960px; line-height: 1.3; }}
    .figs {{ display: flex; gap: 56px; }}
    .figs b {{ display: block; font-size: 54px; font-weight: 800; letter-spacing: -.01em; }}
    .figs span {{ font-size: 22px; color: #5b6763; }}
    .bar {{ display: flex; height: 18px; border-radius: 4px; overflow: hidden; margin-top: 26px; }}
    .bar i {{ display: block; }}
    .url {{ position: absolute; right: 72px; top: 76px; font: 500 22px "DejaVu Sans Mono", monospace; color: #1c5cab; }}
    </style></head><body>
    <div><div class="eyebrow">Edition {f["edition"]}</div><div class="url">langtechindex.org</div>
      <h1>Language Technology Development Index</h1>
      <p>How well technology supports each of the world's languages, and how much data exists to build more.</p></div>
    <div><div class="figs"><div><b>{f["n"]:,}</b><span>living languages scored</span></div>
      <div><b>{f["top"]:,}</b><span>with strong support (Medium or above)</span></div>
      <div><b>{f["none"]:,}</b><span>with no data or technology recorded</span></div></div>
      <div class="bar">{bar}</div></div></body></html>"""


def main() -> None:
    from playwright.sync_api import sync_playwright
    page_html = html(figures())
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1200, "height": 630})
        pg.set_content(page_html)
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(ROOT / "site" / "og.png"))
        b.close()
    print("wrote site/og.png", file=sys.stderr)


if __name__ == "__main__":
    main()
