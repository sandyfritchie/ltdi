"""Speaker counts from Wikipedia, for languages LinguaMeta gives none.

Each language's English Wikipedia article is found through its "ISO 639:xxx" redirect (raw wikitext,
cached in .cache) and the speaker figure read from the infobox. A figure is used only when the infobox's own iso3 code
is the language's (so an article about a macrolanguage, dialect cluster or family is never taken for
one of its members) and no other language in scope lands on the same article.

Run:  python -m ltdi.wikipedia_speakers   (needs en.wikipedia.org)
Writes data/wikipedia_speakers.csv, which the backbone reads; run the backbone again afterwards.
"""

from __future__ import annotations

import csv
import json
import re
import urllib.parse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from . import DATA
from .http import fetch

RAW = "https://en.wikipedia.org/w/index.php?action=raw&title="
OUT = DATA / "wikipedia_speakers.csv"
MULT = {"thousand": 1e3, "million": 1e6, "billion": 1e9}


def article(iso: str) -> tuple[str, str] | None:
    """(title, wikitext) of the article the ISO 639 redirect points to, read as raw wikitext (cached)."""
    title = f"ISO 639:{iso}"
    for _ in range(2):
        try:
            text = fetch(RAW + urllib.parse.quote(title.replace(" ", "_"))).decode("utf-8", "replace")
        except Exception:
            return None
        m = re.match(r"(?i)\s*#REDIRECT\s*\[\[([^\]#|]+)", text)
        if not m:
            return title, text
        title = m.group(1).strip()
    return None


def field(box: str, name: str) -> str:
    m = re.search(rf"^\|\s*{name}\s*=(.*)$", box, re.M)
    return m.group(1).strip() if m else ""


def clean(s: str) -> str:
    s = re.sub(r"(?s)<!--.*?-->", "", s)
    s = re.sub(r"(?s)<ref[^>/]*/>|<ref[^>]*>.*?</ref>", "", s)
    s = re.sub(r"\{\{\s*(?:sigfig|formatnum|nowrap|small|nobr)\s*[|:]\s*([^|}]*)[^}]*\}\}", r"\1", s, flags=re.I)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", s)
    return re.sub(r"<[^>]+>", " ", s).strip()


def parse_speakers(raw: str) -> float | None:
    """The first count in an infobox speakers field: '13 million', '{{sigfig|60.4|2}} million',
    '7+ million', 'c. 2,000 (2010)'. None for 'none', 'extinct' and the like."""
    s = clean(raw)
    if not s or re.match(r"(?i)\s*(none|extinct|no native|unknown|\?|nil|l2\b)", s):
        return None
    for m in re.finditer(r"(?<![A-Za-z\d.])(\d[\d,]*(?:\.\d+)?)\s*\+?\s*(thousand|million|billion)?", s, re.I):
        num, mult = m.group(1).replace(",", ""), (m.group(2) or "").lower()
        value = float(num)
        if not mult and re.fullmatch(r"(1[89]|20)\d\d", m.group(1)):  # a year (2,000 with a comma is a count)
            continue
        return value * MULT.get(mult, 1)
    return None


def main() -> None:
    langs = json.loads((DATA / "languages.json").read_text(encoding="utf-8"))
    want = {l["iso_639_3"]: l["code"] for l in langs if not l["speakers"] and l.get("iso_639_3")}
    found, article_of = {}, {}
    with ThreadPoolExecutor(3) as pool:
        pages = dict(zip(want, pool.map(article, want)))
    for iso, page in pages.items():
        if not page or page[0].startswith("ISO 639:"):
            continue
        title, box = page
        article_of[iso] = title
        iso3 = clean(field(box, "iso3")).lower()
        if iso3 != iso or field(box, "lc1"):
            continue
        n = parse_speakers(field(box, "speakers"))
        if n:
            found[iso] = (n, clean(field(box, "date")), clean(field(box, "speakers"))[:120], title)
    shared = defaultdict(list)
    for iso, title in article_of.items():
        shared[title].append(iso)
    rows = [{"code": want[iso], "speakers": int(n), "date": date, "article": title, "as_written": raw}
            for iso, (n, date, raw, title) in sorted(found.items()) if len(shared[title]) == 1]
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["code", "speakers", "date", "article", "as_written"])
        w.writeheader()
        w.writerows(rows)
    print(f"{len(want)} languages without a count; {len(article_of)} with an article; "
          f"{len(rows)} counts written to {OUT.relative_to(DATA.parent)}")


if __name__ == "__main__":
    main()
