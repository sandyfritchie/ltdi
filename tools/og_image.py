"""Link-preview images, 1200 x 630 (needs Playwright with Chromium):

    python tools/og_image.py               the site's card (site/og.png): the title and three headline figures
                                           from the current edition's table; re-run after each edition
    python tools/og_image.py --languages   a card for each language with one (ltdi.pages.has_card), in
                                           site/og/<code>.png: its name, code, endonym, speakers, score (its tier
                                           as the colour), rank, two dimensions, the main technologies it has and headline data figures; give codes to draw only those;
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
         padding: 44px 72px 66px; border-top: 14px solid var(--tier); font-family: "Source Sans 3", "Noto Sans", sans-serif;
         display: flex; flex-direction: column; justify-content: space-between; }}
  .top {{ display: flex; justify-content: space-between; align-items: center; font: 500 22px "IBM Plex Mono", monospace; }}
  .top #ed {{ padding: 6px 14px; border-radius: 6px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase;
             background: var(--tier); color: var(--tiertext); }}
  .top .url {{ color: #1c5cab; }}
  .head {{ display: flex; gap: 48px; align-items: flex-start; margin-top: 22px; }}
  .who {{ flex: 1; min-width: 0; }}
  /* no overflow clipping here: it cuts off descenders. Long names are shrunk to fit two lines instead */
  h1 {{ font-family: Archivo, "Noto Sans", sans-serif; font-weight: 800; font-size: 88px; line-height: 1.12; letter-spacing: -.02em;
        margin: -8px 0 0; padding-bottom: .06em; }}
  h1 .tail {{ white-space: nowrap; }}
  h1 .code {{ font: 500 34px "IBM Plex Mono", monospace; color: #5b6763; letter-spacing: 0; vertical-align: .55em; white-space: nowrap; }}
  .auto {{ font-size: 38px; line-height: 1.45; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          font-family: "Source Sans 3", "Noto Sans", "Noto Sans CJK SC", sans-serif; }}
  .sub {{ font-size: 26px; line-height: 1.35; color: #5b6763; margin-top: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
  .score {{ flex: none; text-align: right; }}
  .score b {{ display: block; font-family: Archivo, sans-serif; font-weight: 800; font-size: 128px; line-height: .92; letter-spacing: -.02em; }}
  .score.big b {{ font-size: 160px; }}
  .rank {{ font-size: 26px; line-height: 1.35; color: #5b6763; margin-top: 14px; white-space: nowrap; }}
  .foot {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 72px; }}
  .dim {{ display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; font-size: 26px; row-gap: 10px; }}
  .dim > span {{ font-weight: 600; font-family: Archivo, sans-serif; font-size: 30px; }}
  .bar {{ grid-column: 1 / -1; height: 14px; border-radius: 7px; background: #e2e7e5; overflow: hidden; }}
  .bar i {{ display: block; height: 100%; }}
  .under {{ grid-column: 1 / -1; min-width: 0; height: 80px; margin-top: 14px; display: flex; align-items: center; }}
  .icons {{ gap: 12px; }}
  .t {{ width: 72px; height: 72px; border-radius: 13px; display: grid; place-items: center; }}
  .t svg {{ width: 44px; height: 44px; }}
  .t.c {{ background: #4a4fb8; color: #fff; }} .t.o {{ background: #c9cbf0; color: #3b3f96; }}
  .figs {{ gap: 30px; white-space: nowrap; font-size: 26px; line-height: 1.15; color: #5b6763; }}
  .figs b {{ display: block; font-family: Archivo, sans-serif; font-weight: 700; font-size: 49px; line-height: 1.05; color: #16201d; }}
</style></head><body>
  <div><div class="top"><span id="ed"></span><span class="url">langtechindex.org</span></div>
    <div class="head"><div class="who" id="who"><h1 id="h1"><span id="name"></span><span class="tail"><span id="last"></span> <span class="code" id="code"></span></span></h1>
      <div class="auto" id="auto"></div><div class="sub" id="sub"></div></div>
      <div class="score" id="score"><b id="ltdi"></b><div class="rank" id="rank"></div></div></div></div>
  <div class="foot">
    <div class="dim">Technology support<span id="t"></span><div class="bar"><i id="tb" style="background:#4a4fb8"></i></div>
      <div class="under icons" id="icons"></div></div>
    <div class="dim">Data availability<span id="d"></span><div class="bar"><i id="db" style="background:#117a6a"></i></div>
      <div class="under figs" id="figs"></div></div>
  </div>
</body></html>"""

# Fills in one card; a long name is set smaller until it fits on two lines
FILL = """c => {
  const $ = id => document.getElementById(id);
  $('icons').innerHTML = c.techs.map(([k, lv]) => `<span class="t ${lv}">${window.TICON[k] || ''}</span>`).join('');
  $('figs').innerHTML = c.figs.map(([v, u]) => `<span><b>${v}</b>${u}</span>`).join('');
  for (const k of ['ed', 'ltdi', 'rank']) $(k).textContent = c[k];
  const cut = c.name.lastIndexOf(' ') + 1;  // the name's last word stays with the code, so the code never sits on a line alone
  $('name').textContent = c.name.slice(0, cut); $('last').textContent = c.name.slice(cut);
  $('code').textContent = '[' + c.code + ']';
  $('auto').textContent = c.auto || ''; $('auto').lang = c.code; $('auto').style.display = c.auto ? '' : 'none';
  $('d').textContent = c.d.toFixed(2); $('t').textContent = c.t.toFixed(2);
  $('db').style.width = (100 * c.d) + '%'; $('tb').style.width = (100 * c.t) + '%';
  document.body.style.setProperty('--tier', c.bg); document.body.style.setProperty('--tiertext', c.fg);
  // the name on one line if it fits at 64px or more (a short one large, with a larger score beside it); else on two lines
  const h = $('h1'), lines = n => h.getBoundingClientRect().height <= (n + .3) * 1.12 * s && h.scrollWidth <= h.clientWidth + 1;
  const size = (from, to, n) => { for (s = from; s >= to; s -= 4) { h.style.fontSize = s + 'px'; if (lines(n)) return true; } return false; };
  let s; $('score').classList.add('big');
  if (!size(128, 100, 1)) { $('score').classList.remove('big'); if (!size(96, 64, 1)) size(80, 40, 2); }
  // where they are spoken: the shortest wording that fits on one line
  const sb = $('sub'), over = () => sb.scrollWidth > sb.clientWidth + 1; sb.style.fontSize = '';
  // the fullest wording that fits at 23px or more, else the shortest at down to 20px
  fit: for (const t of c.subs) { sb.textContent = t; for (let f = 26; f >= 23; f--) { sb.style.fontSize = f + 'px'; if (!over()) break fit; } }
  for (let f = 22; over() && f >= 20; f--) sb.style.fontSize = f + 'px';
  // the rank on the same line as the speakers and places, when the two are side by side: the rank moves down to
  // that line (up to a line and a half), or the line down to the rank (as far as a line and a half)
  const rk = $('rank'), bottom = e => e.getBoundingClientRect().bottom;
  const align = () => {
    rk.style.marginTop = ''; rk.style.fontSize = ''; sb.style.marginTop = '';
    const d = bottom(sb) - bottom(rk);
    if (d < -75 || d > 110) return;
    rk.style.fontSize = getComputedStyle(sb).fontSize;
    const m = parseFloat(getComputedStyle(rk).marginTop) + bottom(sb) - bottom(rk);
    if (m >= 4) rk.style.marginTop = m + 'px';
    else { rk.style.marginTop = '4px'; sb.style.marginTop = (8 + bottom(rk) - bottom(sb)) + 'px'; }
  };
  align();
  // a tall heading: the bars sit lower, then the name is set smaller
  const room = () => document.querySelector('.foot').getBoundingClientRect().top - Math.max(bottom($('who')), bottom($('score')));
  document.body.style.paddingBottom = '';
  if (room() < 24) document.body.style.paddingBottom = Math.max(44, 66 - (24 - room())) + 'px';
  while (room() < 24 && s > 40) { h.style.fontSize = (s -= 4) + 'px'; align(); }
  // many or long figures: closer together, then smaller units, then smaller numbers
  const fg = $('figs'), wide = () => fg.scrollWidth > fg.clientWidth + 1, nums = fg.querySelectorAll('b');
  fg.style.fontSize = ''; fg.style.gap = '';
  for (let g = 30; wide() && g > 20; ) fg.style.gap = (g -= 2) + 'px';
  for (let f = 26; wide() && f > 19; ) fg.style.fontSize = (f -= 1) + 'px';
  for (let n = 49; wide() && n > 34; ) { n -= 1; nums.forEach(b => b.style.fontSize = n + 'px'); }
}"""

# the six technologies a card shows, and its data figures with their units
PRIMARY = ["keyboard", "speech_input", "tts", "mt", "llm", "assistant"]
FIGS = [("web_text_words", "words", "word"), ("parallel_sentences", "sentence pairs", "sentence pair"),
        ("wikipedia_articles", "articles", "article"), ("open_speech_hours", "hours", "hour")]
SHORT = {"United States": "USA", "United Kingdom": "UK", "United Arab Emirates": "UAE", "Central African Republic": "CAR",
         "Bosnia & Herzegovina": "Bosnia", "Republic of the Congo": "Congo", "St. Vincent & Grenadines": "St Vincent",
         "Svalbard & Jan Mayen": "Svalbard"}


def compact(v: float) -> str:
    """Two significant figures with K, M, B or T: 7,263,483 -> 7.3M, 89,615 -> 90K, 0.5 -> 0.5."""
    if v < 1:
        return f"{v:.1f}"
    from math import floor, log10
    v = round(v, 1 - floor(log10(v)))  # two significant figures first, so 995,000 becomes 1M, not 1000K
    for n, u in ((1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K"), (1, "")):
        if v >= n:
            return f"{v / n:.1f}".removesuffix(".0") + u if v / n < 10 else f"{v / n:.0f}{u}"


def facts() -> dict[str, dict]:
    import json
    out = {}
    for f in (ROOT / "site" / "data" / "lang").glob("*.json"):
        for code, d in json.loads(f.read_text(encoding="utf-8")).items():
            out[code] = d.get("facts") or {}
    return out


def places(l: dict) -> list[str]:
    """Where it is mainly spoken, in ever shorter wordings: the card uses the first that fits. Up to three
    countries are named; never "& 1 other". Places with no permanent population are left out."""
    sys.path.insert(0, str(ROOT))
    from ltdi.build_site import NOT_PLACES
    cs = [SHORT.get(c["name"], c["name"]) for c in l.get("countries", [])
          if not c.get("census_only") and c["code"] not in NOT_PLACES]
    if not cs:
        return [""]
    if len(cs) == 1:
        return [f"Mainly in {cs[0]}"]
    if len(cs) == 2:
        return [f"Mainly in {cs[0]} and {cs[1]}"]
    if len(cs) == 3:
        return [f"Mainly in {cs[0]}, {cs[1]} and {cs[2]}", f"Mainly in {cs[0]} & 2 others"]
    return [f"Mainly in {cs[0]}, {cs[1]} & {len(cs) - 2} others", f"Mainly in {cs[0]} & {len(cs) - 1} others"]


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
    fx = facts()
    out = []
    for l in scores["languages"]:
        if not has_card(l):
            continue
        auto = l.get("autonym") or ""
        f = fx.get(l["code"], {})
        levels = l.get("own_levels") or l.get("levels") or {}
        out.append({"code": l["code"], "name": l["name"], "ed": "Language Technology Development Index",
                    "auto": auto if auto.casefold() != l["name"].casefold() else "",
                    "subs": [" · ".join(filter(None, [f"{_people(l.get('speakers'))} speakers", p])) for p in places(l)],
                    "ltdi": f"{l['ltdi']:.3f}", "tier": tiers.get(l["tier"], l["tier"]), "tk": l["tier"],
                    "rank": f"{'Joint ' if l.get('tied') else ''}{l['rank']:,} of {n:,} languages",
                    "d": l["dimensions"]["data"]["score"], "t": l["dimensions"]["tech"]["score"],
                    # of the six main technologies, those it has: commercial (fully or in part) or open tools only;
                    # none left out. A variety written in a standard shows its own, not what it reaches through the standard
                    "techs": [[k, "c" if levels.get(k) in ("full", "part") else "o"] for k in PRIMARY
                              if levels.get(k) in ("full", "part", "open")],
                    "figs": [[compact(f[k][0]), one if f[k][0] == 1 else many] for k, many, one in FIGS
                             if f.get(k) and f[k][0] and f[k][0] > 0]})
    return out


def languages(only: set[str] | None = None) -> None:
    import json
    from playwright.sync_api import sync_playwright
    out = ROOT / "site" / "og"
    out.mkdir(parents=True, exist_ok=True)
    cs = [c for c in cards() if not only or c["code"] in only]
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1200, "height": 630})
        pg.set_content(CARD, wait_until="networkidle")
        pg.evaluate("t => { window.TICON = t; }", icons())
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
