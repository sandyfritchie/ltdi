"""Link-preview images, 1200 x 630 (needs Playwright with Chromium):

    python tools/og_image.py               the site's card (site/og.png): the title and three headline figures
                                           from the current edition's table; re-run after each edition
    python tools/og_image.py --languages   a card for each language with one (ltdi.pages.has_card), in
                                           site/og/<code>.png: its name, score, tier, rank and two dimensions;
                                           drawn at publish time (.github/workflows/pages.yml), not committed
                                           (needs data/scores.json, from python -m ltdi.score)"""

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


TIER_TEXT = {"vh": "#fff", "h": "#fff", "lo": "#fff", "ld": "#fff"}  # light text on the darker tiers
TIER_BG = {"vh": "#1c5cab", "h": "#4b8fd9", "m": "#9cc4f0", "lc": "#f2b27a", "lo": "#e07b36", "ld": "#b4481a", "ln": "#b9c1bd"}
FONTS = ("https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,500..800"
         "&family=Source+Sans+3:wght@400;600&family=IBM+Plex+Mono:wght@500&display=block")

CARD = f"""<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="{FONTS}"><style>
  body {{ margin: 0; width: 1200px; height: 630px; background: #f5f7f6; color: #16201d; box-sizing: border-box;
         padding: 60px 72px 56px; border-top: 14px solid var(--tier); font-family: "Source Sans 3", sans-serif;
         display: flex; flex-direction: column; justify-content: space-between; }}
  .top {{ display: flex; justify-content: space-between; font: 500 22px "IBM Plex Mono", monospace; letter-spacing: .06em;
         color: #5b6763; text-transform: uppercase; }}
  .top .url {{ color: #1c5cab; text-transform: none; letter-spacing: 0; }}
  h1 {{ font-family: Archivo, sans-serif; font-weight: 800; font-size: 92px; line-height: 1; letter-spacing: -.02em;
        margin: 26px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
  .sub {{ font-size: 28px; color: #5b6763; margin-top: 14px; }}
  .mid {{ display: flex; align-items: flex-end; gap: 64px; }}
  .score b {{ display: block; font-family: Archivo, sans-serif; font-weight: 800; font-size: 120px; line-height: .9; letter-spacing: -.02em; }}
  .chip {{ display: inline-block; margin-top: 14px; padding: 6px 14px; border-radius: 6px; font: 600 22px "IBM Plex Mono", monospace;
          letter-spacing: .08em; text-transform: uppercase; background: var(--tier); color: var(--tiertext); }}
  .rank {{ font-size: 26px; color: #5b6763; margin-left: 14px; }}
  .dims {{ flex: 1; display: grid; gap: 22px; padding-bottom: 8px; }}
  .dim {{ display: grid; grid-template-columns: 1fr auto; font-size: 26px; row-gap: 8px; }}
  .dim span {{ font-weight: 600; font-family: Archivo, sans-serif; font-size: 30px; }}
  .bar {{ grid-column: 1 / -1; height: 14px; border-radius: 7px; background: #e2e7e5; overflow: hidden; }}
  .bar i {{ display: block; height: 100%; }}
  .gaps {{ font-size: 26px; color: #5b6763; }}
</style></head><body>
  <div><div class="top"><span id="ed"></span><span class="url">langtechindex.org</span></div>
    <h1 id="name"></h1><div class="sub" id="sub"></div></div>
  <div class="mid"><div class="score"><b id="ltdi"></b><span class="chip" id="tier"></span><span class="rank" id="rank"></span></div>
    <div class="dims">
      <div class="dim">Data availability<span id="d"></span><div class="bar"><i id="db" style="background:#117a6a"></i></div></div>
      <div class="dim">Technology support<span id="t"></span><div class="bar"><i id="tb" style="background:#4a4fb8"></i></div></div>
    </div></div>
  <div class="gaps" id="gaps"></div>
</body></html>"""


def cards() -> list[dict]:
    """What each language's card shows."""
    import json
    sys.path.insert(0, str(ROOT))
    from ltdi import DATA
    from ltdi.pages import _people, has_card
    scores = json.loads((DATA / "scores.json").read_text(encoding="utf-8"))
    cfg = scores["config"]
    tiers = {k: t for k, t, *_ in cfg["tiers"]["cutoffs"]} | {k: t for k, t, *_ in cfg["tiers"]["stages"]}
    techs = cfg["dimensions"]["tech"]["technologies"]
    n = sum(1 for l in scores["languages"] if l.get("rank"))
    out = []
    for l in scores["languages"]:
        if not has_card(l):
            continue
        low = lambda s: s if s[:2].isupper() else s[0].lower() + s[1:]
        gaps = [low(techs[k]["label"]) for k, g in (l.get("gaps") or {}).items() if g]
        listed = gaps[:3]
        gap = (f"No commercial service yet for {', '.join(listed[:-1]) + ' or ' + listed[-1] if len(listed) > 1 else listed[0]}"
               f"{' and more' if len(gaps) > 3 else ''}") if gaps else "Commercial services in every technology tracked"
        countries = [c["name"] for c in l.get("countries", []) if not c.get("census_only")][:2]
        out.append({"code": l["code"], "name": l["name"], "ed": f"LTDI · Edition {scores['edition']}",
                    "sub": " · ".join(filter(None, [f"{_people(l.get('speakers'))} speakers", "Mainly in " + " and ".join(countries) if countries else ""])),
                    "ltdi": f"{l['ltdi']:.3f}", "tier": tiers.get(l["tier"], l["tier"]), "tk": l["tier"],
                    "rank": f"{'Joint rank' if l.get('tied') else 'Rank'} {l['rank']:,} of {n:,}",
                    "d": l["dimensions"]["data"]["score"], "t": l["dimensions"]["tech"]["score"], "gaps": gap})
    return out


def languages() -> None:
    from playwright.sync_api import sync_playwright
    out = ROOT / "site" / "og"
    out.mkdir(parents=True, exist_ok=True)
    cs = cards()
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1200, "height": 630})
        pg.set_content(CARD, wait_until="networkidle")
        pg.evaluate("document.fonts.ready")
        for c in cs:
            pg.evaluate("""c => {
              const $ = id => document.getElementById(id);
              for (const k of ['ed', 'name', 'sub', 'ltdi', 'tier', 'rank', 'gaps']) $(k).textContent = c[k];
              $('d').textContent = c.d.toFixed(2); $('t').textContent = c.t.toFixed(2);
              $('db').style.width = (100 * c.d) + '%'; $('tb').style.width = (100 * c.t) + '%';
              document.body.style.setProperty('--tier', c.bg); document.body.style.setProperty('--tiertext', c.fg);
              const h = $('name'); h.style.fontSize = ''; let s = 92;  // long names shrink to fit one line
              while (h.scrollWidth > h.clientWidth && s > 48) h.style.fontSize = (s -= 4) + 'px';
            }""", {**c, "bg": TIER_BG.get(c["tk"], "#1c5cab"), "fg": TIER_TEXT.get(c["tk"], "#16201d")})
            pg.screenshot(path=str(out / f"{c['code']}.png"))
        b.close()
    print(f"wrote {len(cs)} cards to site/og", file=sys.stderr)


def main() -> None:
    if "--languages" in sys.argv:
        languages()
        return
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
