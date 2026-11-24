"""The public site's pages: the home page, a page for every language at /language/<code>, a 404 page and
the sitemap.

The site is one app. build_site writes its parts as files the browser caches between pages and visits
(app.css, app.js and data/index.js, each linked with its content hash so a new edition is picked up at
once), and a small home page that loads them. Each language then gets its own small page,
site/language/<code>.html, served by GitHub Pages at /language/<code>: the same app, with the
language's own title, description, link preview and canonical address, so search engines can find it
and a shared link shows the language rather than the home page. The app reads the address and opens
the language. 404.html is the app too, so an unknown address opens the ranking.

The language pages and the sitemap are written when the site is published (pages.yml runs
python -m ltdi.pages), not committed: they come from the committed data, and there are 7,450.

The preview (site/artifact.html) keeps everything inline and uses #lang-<code>, since it can't serve paths."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
from html import escape

from . import DATA
from .build_site import SITE, add_census

SITE_URL = "https://langtechindex.org"
# The GoatCounter site code (https://<code>.goatcounter.com) that counts visits on the public site, or ""
# for none. Only the public pages get it, not the preview.
GOATCOUNTER = "langtechindex"


def _counter() -> str:
    if not GOATCOUNTER:
        return ""
    return ('<script>window.goatcounter = {no_onload: true}</script>\n'  # the app counts each view itself
            f'<script data-goatcounter="https://{GOATCOUNTER}.goatcounter.com/count" async '
            'src="https://gc.zgo.at/count.js"></script>\n')


def _v(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:10]


def write_app(page: str, data_js: str) -> str:
    """Split the assembled page (site/src assembled, with its data) into app.css, app.js and data/index.js plus
    the home page's HTML; write them and return the home page."""
    head, _, body = page.partition('<div class="wrap">')
    css = re.search(r"<style>(.*?)</style>", head, re.S)
    js = body[body.rindex("<script>") + len("<script>"):body.rindex("</script>")]
    skeleton = body[:body.index('<script id="ltdi-data"')]
    files = {"app.css": css.group(1), "app.js": js, "data/index.js": data_js}
    for name, text in files.items():
        (SITE / name).write_text(text, encoding="utf-8")
    v = {k: _v(t) for k, t in files.items()}
    head = head.replace(css.group(0), f'<link rel="stylesheet" href="/app.css?v={v["app.css"]}">')
    head = head.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")  # the preview's, not the site's
    html = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<base href="/">\n' + head + '</head>\n<body>\n<div class="wrap">' + skeleton
            + _counter()
            + f'<script src="/data/index.js?v={v["data/index.js"]}"></script>\n'
            + f'<script src="/app.js?v={v["app.js"]}"></script>\n</body>\n</html>\n')
    (SITE / "index.html").write_text(html, encoding="utf-8")
    not_found = html.replace("<title>", '<meta name="robots" content="noindex">\n<title>', 1)
    (SITE / "404.html").write_text(not_found, encoding="utf-8")
    return html


# Languages with their own link-preview card (site/og/<code>.png, drawn at publish time by
# tools/og_image.py --languages): every ranked language with at least this many speakers. The rest use the
# site's card (site/og.png).
CARD_MIN_SPEAKERS = 1_000_000


def has_card(l: dict) -> bool:
    return bool(l.get("rank")) and (l.get("speakers") or 0) >= CARD_MIN_SPEAKERS


def _meta(html: str, title: str, description: str, url: str, static: str, image: tuple[str, str] | None = None) -> str:
    t, d, u = escape(title, quote=True), escape(description, quote=True), escape(url, quote=True)
    subs = [(r"<title>.*?</title>", f"<title>{t}</title>"),
            (r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{d}">'),
            (r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{t}">'),
            (r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{d}">'),
            (r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{u}">'),
            (r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{u}">'),
            (r'<main id="view">.*?</main>', f'<main id="view">{static}</main>')]
    if image:  # the language's own card
        subs += [(r'<meta property="og:image" content="[^"]*">', f'<meta property="og:image" content="{escape(image[0], quote=True)}">'),
                 (r'<meta property="og:image:alt" content="[^"]*">', f'<meta property="og:image:alt" content="{escape(image[1], quote=True)}">')]
    for pat, rep in subs:
        html, n = re.subn(pat, lambda _m, r=rep: r, html, count=1, flags=re.S)
        assert n == 1, pat
    return html


def _people(n: float | None) -> str:
    if not n:
        return ""
    for div, unit in ((1e9, " billion"), (1e6, " million"), (1e3, ",000")):
        if n >= div:
            v = n / div
            return f"{v:,.0f}{unit}" if unit == ",000" else f"{v:.1f}".rstrip("0").rstrip(".") + unit
    return f"{n:,.0f}"


def describe(l: dict, cfg: dict, n_ranked: int) -> tuple[str, str, str]:
    """A language page's title, description and the text shown before the app opens."""
    tiers = {k: t for k, t, *_ in cfg["tiers"]["cutoffs"]} | {k: t for k, t, *_ in cfg["tiers"]["stages"]}
    techs = cfg["dimensions"]["tech"]["technologies"]
    name, tier = l["name"], tiers.get(l["tier"], l["tier"])
    d, t = l["dimensions"]["data"]["score"], l["dimensions"]["tech"]["score"]
    title = f"{name}: language technology support · LTDI"
    spk = _people(l.get("speakers"))
    where = f"ranked {l['rank']:,} of {n_ranked:,}" if l.get("rank") else "not ranked (no longer spoken)"
    desc = (f"{name}{f' ({spk} speakers)' if spk else ''}: LTDI {l['ltdi']:.3f}, {where}, {tier} tier. "
            f"Data availability {d:.2f}, technology support {t:.2f}.")
    offered = [techs[k]["label"] for k, v in (l.get("levels") or {}).items() if v in ("full", "part")]
    countries = [c["name"] for c in l.get("countries", []) if not c.get("census_only")][:5]
    auto = l.get("autonym")
    auto = f' <span lang="{escape(l["code"])}">{escape(auto)}</span>' if auto and auto != name else ""
    static = (f'<noscript><div class="static"><h2>{escape(name)}{auto}</h2>'
              f"<p>{escape(desc)}</p>"
              + (f"<p>Spoken in {escape(', '.join(countries))}.</p>" if countries else "")
              + (f"<p>Commercial services cover: {escape(', '.join(offered))}.</p>" if offered else "")
              + f'<p>This page needs JavaScript for the full profile. The scores for every language are also a '
                f'<a href="/data/ltdi-{cfg["meta"]["edition"]}.csv">CSV file</a>, and this language as '
                f'<a href="/api/v1/languages/{escape(l["code"])}.json">JSON</a>.</p></div></noscript>')
    return title, desc, static


def write_language_pages() -> int:
    """site/language/<code>.html for every language, and site/sitemap.xml (needs data/scores.json and
    the home page from build_site)."""
    scores = json.loads((DATA / "scores.json").read_text(encoding="utf-8"))
    add_census(scores)
    cfg = scores["config"]
    cfg["meta"]["edition"] = scores["edition"]
    home = (SITE / "index.html").read_text(encoding="utf-8")
    out = SITE / "language"
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    n_ranked = sum(1 for l in scores["languages"] if l.get("rank"))
    urls = [f"{SITE_URL}/"]
    for l in scores["languages"]:
        url = f"{SITE_URL}/language/{l['code']}"
        title, desc, static = describe(l, cfg, n_ranked)
        image = (f"{SITE_URL}/og/{l['code']}.png", f"{l['name']}: LTDI {l['ltdi']:.3f}, rank {l['rank']:,} of {n_ranked:,}") if has_card(l) else None
        (out / f"{l['code']}.html").write_text(_meta(home, title, desc, url, static, image), encoding="utf-8")
        if not l.get("extinct"):
            urls.append(url)
    ed = scores["edition"]
    (SITE / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{u}</loc><lastmod>{ed}</lastmod></url>\n" for u in urls) + "</urlset>\n", encoding="utf-8")
    return len(scores["languages"])


def main() -> None:
    n = write_language_pages()
    print(f"wrote {n:,} language pages to site/language and site/sitemap.xml")


if __name__ == "__main__":
    main()
