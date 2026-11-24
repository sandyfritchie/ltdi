"""Link-preview images, 1200 x 630 (needs Playwright with Chromium):

    python tools/og_image.py               the site's card (site/og.png): the title and three headline figures
                                           from the current edition's table; re-run after each edition
    python tools/og_image.py --languages   a card for each language with one (ltdi.pages.has_card), in
                                           site/og/<code>.png: its name, code, endonym, speakers, small map, score,
                                           tier, rank, two dimensions and the technologies it has; give codes to draw only those;
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
         padding: 44px 72px 44px; border-top: 14px solid var(--tier); font-family: "Source Sans 3", "Noto Sans", sans-serif;
         display: flex; flex-direction: column; justify-content: space-between; }}
  .top {{ display: flex; justify-content: space-between; font: 500 22px "IBM Plex Mono", monospace; letter-spacing: .06em;
         color: #5b6763; text-transform: uppercase; }}
  .top .url {{ color: #1c5cab; text-transform: none; letter-spacing: 0; }}
  .head {{ display: flex; gap: 40px; align-items: flex-start; margin-top: 18px; }}
  .who {{ flex: 1; min-width: 0; }}
  h1 {{ font-family: Archivo, "Noto Sans", sans-serif; font-weight: 800; font-size: 76px; line-height: 1.14; letter-spacing: -.02em;
        margin: -6px 0 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }}
  h1 .code {{ font: 500 34px "IBM Plex Mono", monospace; color: #5b6763; letter-spacing: 0; vertical-align: .55em; white-space: nowrap; }}
  .auto {{ font-size: 38px; line-height: 1.3; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          font-family: "Source Sans 3", "Noto Sans", "Noto Sans CJK SC", sans-serif; }}
  .sub {{ font-size: 26px; color: #5b6763; margin-top: 10px; }}
  .map {{ flex: none; width: 380px; height: 236px; border: 1px solid #d9e0dd; border-radius: 8px; overflow: hidden; background: #fff; }}
  .map svg {{ display: block; width: 100%; height: 100%; }}
  .map .land {{ fill: #e2e7e5; }}
  .map .area {{ fill: var(--tier); fill-opacity: .8; }}
  .map .borders {{ fill: none; stroke: #16201d; stroke-opacity: .25; stroke-width: .8px; vector-effect: non-scaling-stroke; }}
  .map .dot {{ fill: var(--tier); stroke: #fff; stroke-width: 2px; vector-effect: non-scaling-stroke; }}
  .map .ring {{ fill: none; stroke: #16201d; stroke-width: 2.5px; vector-effect: non-scaling-stroke; }}
  .mid {{ display: flex; align-items: flex-end; gap: 64px; }}
  .score {{ width: 470px; flex: none; }}
  .score b {{ display: block; font-family: Archivo, sans-serif; font-weight: 800; font-size: 100px; line-height: .9; letter-spacing: -.02em; }}
  .chip {{ display: inline-block; margin-top: 14px; padding: 6px 14px; border-radius: 6px; font: 600 22px "IBM Plex Mono", monospace;
          letter-spacing: .08em; text-transform: uppercase; background: var(--tier); color: var(--tiertext); }}
  .rank {{ font-size: 26px; color: #5b6763; margin-left: 14px; white-space: nowrap; }}
  .dims {{ flex: 1; display: grid; gap: 20px; padding-bottom: 8px; }}
  .dim {{ display: grid; grid-template-columns: 1fr auto; font-size: 26px; row-gap: 8px; }}
  .dim span {{ font-weight: 600; font-family: Archivo, sans-serif; font-size: 30px; }}
  .bar {{ grid-column: 1 / -1; height: 14px; border-radius: 7px; background: #e2e7e5; overflow: hidden; }}
  .bar i {{ display: block; height: 100%; }}
  .techs {{ display: flex; align-items: center; gap: 10px; margin-top: 26px; }}
  .techs .t {{ width: 46px; height: 46px; border-radius: 9px; display: grid; place-items: center; }}
  .techs .t svg {{ width: 28px; height: 28px; }}
  .t.c {{ background: #184f95; color: #fff; }} .t.o {{ background: #86b6ef; color: #0d2a4d; }}
  .none {{ font-size: 24px; color: #5b6763; line-height: 46px; }}
  .key {{ margin-left: auto; display: flex; gap: 22px; font-size: 21px; color: #5b6763; white-space: nowrap; }}
  .key i {{ display: inline-block; width: 16px; height: 16px; border-radius: 4px; margin-right: 8px; vertical-align: -1px; }}
</style></head><body>
  <div><div class="top"><span id="ed"></span><span class="url">langtechindex.org</span></div>
    <div class="head"><div class="who"><h1><span id="name"></span> <span class="code" id="code"></span></h1>
      <div class="auto" id="auto"></div><div class="sub" id="sub"></div></div>
      <div class="map" id="map"><svg aria-hidden="true"><path class="land" id="land"/><path class="area" id="area"/>
        <path class="borders" id="borders"/><circle class="dot" id="dot" r="0"/><circle class="ring" id="ring" r="0"/></svg></div></div></div>
  <div><div class="mid"><div class="score"><b id="ltdi"></b><span class="chip" id="tier"></span><span class="rank" id="rank"></span></div>
    <div class="dims">
      <div class="dim">Data availability<span id="d"></span><div class="bar"><i id="db" style="background:#117a6a"></i></div></div>
      <div class="dim">Technology support<span id="t"></span><div class="bar"><i id="tb" style="background:#4a4fb8"></i></div></div>
    </div></div>
    <div class="techs"><span id="icons" style="display:contents"></span>
      <span class="key"><span><i style="background:#184f95"></i>Commercial</span><span><i style="background:#86b6ef"></i>Open tools only</span></span></div></div>
</body></html>"""

# Draws one card: the same framing as the small map on a language's page (site/src/js/charts-map.js,
# bindMiniMap): its area, or a dot at its location, with room around it, and detailed coasts once zoomed in
FILL = """c => {
  const $ = id => document.getElementById(id), G = window.GEO, B = window.BORDERS, ASPECT = 236 / 380;
  $('icons').innerHTML = c.techs.length ? c.techs.map(([k, lv, label]) => `<span class="t ${lv}" title="${label}">${window.TICON[k] || ''}</span>`).join('')
    : '<span class="none">No technology recorded in the sources tracked</span>';  // and no key
  document.querySelector('.key').style.visibility = c.techs.length ? '' : 'hidden';
  for (const k of ['ed', 'name', 'sub', 'ltdi', 'tier', 'rank']) $(k).textContent = c[k];
  $('code').textContent = '[' + c.code + ']';
  $('auto').textContent = c.auto || ''; $('auto').lang = c.code; $('auto').style.display = c.auto ? '' : 'none';
  $('d').textContent = c.d.toFixed(2); $('t').textContent = c.t.toFixed(2);
  $('db').style.width = (100 * c.d) + '%'; $('tb').style.width = (100 * c.t) + '%';
  document.body.style.setProperty('--tier', c.bg); document.body.style.setProperty('--tiertext', c.fg);
  const h = $('name').parentElement; let s = 80; h.style.fontSize = '';  // long names: two lines, then smaller
  while ((h.scrollHeight > h.clientHeight + 2) && s > 44) h.style.fontSize = (s -= 4) + 'px';
  const area = G.areas && G.areas.paths[c.code], p = G.points.find(q => q[0] === c.code);
  $('map').style.visibility = area || p ? '' : 'hidden';
  if (!area && !p) return;
  const W = G.basemap.width, H = G.basemap.height, svg = $('map').querySelector('svg');
  $('area').setAttribute('d', area || ''); $('land').setAttribute('d', G.basemap.path); $('borders').setAttribute('d', G.basemap.path);
  let cx, cy, w, small = true;
  if (area) {
    const b = $('area').getBBox(), size = Math.max(b.width, b.height / ASPECT);
    cx = b.x + b.width / 2; cy = b.y + b.height / 2; w = Math.min(W, Math.max(W / 8, size * 2.5)); small = size < w / 12;
  } else { cx = p[2]; cy = p[3]; w = W / 7; }
  const hh = w * ASPECT, x = w < W ? Math.min(W - w, Math.max(0, cx - w / 2)) : 0, y = hh < H ? Math.min(H - hh, Math.max(0, cy - hh / 2)) : (H - hh) / 2;
  svg.setAttribute('viewBox', `${x} ${y} ${w} ${hh}`);
  if (w < W / 3 && B) { $('land').setAttribute('d', B); $('borders').setAttribute('d', B); }
  $('dot').setAttribute('cx', area ? -99 : cx); $('dot').setAttribute('cy', area ? -99 : cy); $('dot').setAttribute('r', area ? 0 : (w * 0.016).toFixed(3));
  $('ring').setAttribute('cx', cx); $('ring').setAttribute('cy', cy); $('ring').setAttribute('r', small ? (w * 0.06).toFixed(3) : 0);
}"""


def icons() -> dict[str, str]:
    """The technologies' icons, as the site draws them (TICON in site/src/js/language.js)."""
    import re
    js = (ROOT / "site" / "src" / "js" / "language.js").read_text(encoding="utf-8")
    head = re.search(r"const ICON = p => `([^`]*)\$\{p\}([^`]*)`", js)
    return {k: head.group(1) + body + head.group(2) for k, body in re.findall(r"^\s+(\w+): ICON\('([^']*)'\)", js, re.M)}


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
        countries = [c["name"] for c in l.get("countries", []) if not c.get("census_only")][:2]
        auto = l.get("autonym") or ""
        out.append({"code": l["code"], "name": l["name"], "ed": "Language Technology Development Index",
                    "auto": auto if auto.casefold() != l["name"].casefold() else "",
                    "sub": " · ".join(filter(None, [f"{_people(l.get('speakers'))} speakers", "Mainly in " + " and ".join(countries) if countries else ""])),
                    "ltdi": f"{l['ltdi']:.3f}", "tier": tiers.get(l["tier"], l["tier"]), "tk": l["tier"],
                    "rank": f"{'Joint rank' if l.get('tied') else 'Rank'} {l['rank']:,} of {n:,}",
                    "d": l["dimensions"]["data"]["score"], "t": l["dimensions"]["tech"]["score"],
                    # the technologies it has: commercial (fully or in part) or open tools only; none left out. A
                    # variety written in a standard shows its own, as scored, not what it reaches through the standard
                    "techs": [[k, "c" if v in ("full", "part") else "o", techs[k]["label"]]
                              for k, v in (l.get("own_levels") or l.get("levels") or {}).items() if v in ("full", "part", "open")]})
    return out


def languages(only: set[str] | None = None) -> None:
    import json
    from playwright.sync_api import sync_playwright
    out = ROOT / "site" / "og"
    out.mkdir(parents=True, exist_ok=True)
    cs = [c for c in cards() if not only or c["code"] in only]
    geo = (ROOT / "site" / "data" / "map.json").read_text(encoding="utf-8")
    borders = json.loads((ROOT / "site" / "data" / "borders.json").read_text(encoding="utf-8"))
    detail = "".join(borders["countries"].values()) + borders["other"]
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1200, "height": 630})
        pg.set_content(CARD, wait_until="networkidle")
        pg.evaluate("([g, b, t]) => { window.GEO = JSON.parse(g); window.BORDERS = b; window.TICON = t; }", [geo, detail, icons()])
        pg.evaluate("document.fonts.ready")
        for c in cs:
            pg.evaluate(FILL, {**c, "bg": TIER_BG.get(c["tk"], "#1c5cab"), "fg": TIER_TEXT.get(c["tk"], "#16201d")})
            pg.screenshot(path=str(out / f"{c['code']}.png"))
        b.close()
    print(f"wrote {len(cs)} cards to site/og", file=sys.stderr)


def main() -> None:
    if "--languages" in sys.argv:
        rest = [a for a in sys.argv[1:] if not a.startswith("--")]
        languages(set(rest) or None)  # codes given: only those (to check a few)
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
