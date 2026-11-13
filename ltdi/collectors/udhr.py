"""A writing sample for each language: Article 1 of the Universal Declaration of Human Rights.

From the UDHR in XML project (https://efele.net/udhr, formerly Unicode's "UDHR in Unicode"; repository
eric-muller/udhr), which puts the translations collected by the UN Office of the High Commissioner for
Human Rights and others into one XML form. Only texts at its stage 4 ("reasonably complete") are used,
from a pinned commit. Not an indicator: the site shows the text on each language's page.

Where several texts map to one language (dialects, scripts, older orthographies), the one kept is in
the language's main script, then tagged for the language itself rather than a variety of it, then
with the plainest tag.

  python -m ltdi.collectors.udhr   -> data/udhr_article1.csv
"""

from __future__ import annotations

import csv
import html
import json
import re
import sys
import xml.etree.ElementTree as ET

from .. import DATA
from ..crosswalk import to_ltdi
from ..http import fetch

REPO = "eric-muller/udhr"
COMMIT = "588b3f4b2d0467aff54842a4b926551b69d5a66a"  # 28 July 2026
RAW = f"https://raw.githubusercontent.com/{REPO}/{COMMIT}/data/udhr"
OUT = DATA / "udhr_article1.csv"
NS = "{http://efele.net/udhr}"
FIELDS = ["language", "f", "bcp47", "script", "dir", "name", "text"]


def index() -> list[dict]:
    text = fetch(f"{RAW}/index.xml").decode("utf-8")
    return [dict(re.findall(r"([\w:-]+)='([^']*)'", m)) for m in re.findall(r"<udhr ([^>]*)/>", text)]


def article1(f: str) -> str | None:
    root = ET.fromstring(fetch(f"{RAW}/udhr_{f}.xml"))
    for art in root.iter(f"{NS}article"):
        if art.get("number") == "1":
            parts = [" ".join("".join(el.itertext()).split()) for el in art if el.tag != f"{NS}title"]
            return " ".join(p for p in parts if p) or None
    return None


def main(argv=None):
    langs = {l["code"]: l for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))}
    best: dict[str, tuple] = {}
    for e in index():
        if e.get("stage") != "4" or e.get("iso639-3") in (None, "", "und"):
            continue
        code = to_ltdi(e["iso639-3"]) or to_ltdi(e.get("bcp47", ""))
        if code not in langs:
            continue
        main_script = (langs[code].get("scripts") or [""])[0].lower()
        script = e.get("iso15924", "").lower()
        rank = (script != main_script and not (script == "hani" and main_script in ("hans", "hant")),  # its own script first
                e["iso639-3"] != (langs[code].get("iso_639_3") or code),  # the language, not a variety
                "old" in e.get("n", "").lower(),                     # "old orthography"
                e.get("bcp47", "").count("-"),                       # plainest tag
                bool(re.search(r"\(|\d", e.get("n", ""))),           # "(2)", "(008)": a second text
                e["f"])
        if code not in best or rank < best[code][0]:
            best[code] = (rank, e)
    rows = []
    for code, (_, e) in sorted(best.items()):
        try:
            text = article1(e["f"])
        except Exception as err:  # one unreadable file shouldn't stop the rest
            print(f"  {e['f']}: {err}", file=sys.stderr)
            continue
        if text:
            rows.append({"language": code, "f": e["f"], "bcp47": e.get("bcp47", ""), "script": e.get("iso15924", ""),
                         "dir": e.get("dir", "ltr"), "name": html.unescape(e.get("n", "")), "text": text})
    with OUT.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {OUT}: Article 1 for {len(rows)} languages")


if __name__ == "__main__":
    sys.exit(main())
