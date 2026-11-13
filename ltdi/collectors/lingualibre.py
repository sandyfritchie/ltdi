"""Hear the language: a few words spoken by a speaker, from Lingua Libre.

Lingua Libre (https://lingualibre.org) is Wikimedia's project for recording speakers of any language
saying words and sentences from lists; the recordings are on Wikimedia Commons under CC BY-SA 4.0, one
file per word, named "LL-Q<language item> (<ISO 639-3>)-<speaker>-<transcription>.wav". Many of the words
come from Wikidata's lexemes, which have English glosses, so the page can say "a Yoruba speaker says omi
(water)".

For each language: its Commons category (Lingua Libre pronunciation-<ISO 639-3>), the files in it, and
the Wikidata lexemes in the language whose forms have a Lingua Libre recording, for their glosses. Kept:
up to CLIPS recordings, words with an English gloss first, from as few speakers as possible (one voice
reads more naturally than a word from each), with the MP3 that Commons transcodes for each file.

Runs on GitHub Actions (lingualibre.yml), since Wikimedia's sites aren't reachable from every network:
  python -m ltdi.collectors.lingualibre   -> data/lingualibre.csv
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
import time
import urllib.parse
from collections import Counter, defaultdict

from .. import DATA
from ..crosswalk import to_ltdi
from ..http import fetch

COMMONS = "https://commons.wikimedia.org/w/api.php"
WDQS = "https://query.wikidata.org/sparql"
PREFIX = "Lingua Libre pronunciation-"
OUT = DATA / "lingualibre.csv"
CLIPS = 4
FIELDS = ["language", "iso", "file", "mp3", "transcription", "gloss", "speaker", "recordings", "speakers"]
NAME = re.compile(r"^File:LL-Q\d+ \(([^)]+)\)-(.+?)-(.+)\.(?:wav|ogg|flac|mp3|webm)$", re.I)


def api(params: dict) -> dict:
    url = COMMONS + "?" + urllib.parse.urlencode(params | {"format": "json", "formatversion": 2})
    for attempt in range(5):
        try:
            return json.loads(fetch(url, cache=False))
        except Exception as e:
            if attempt == 4:
                raise
            print(f"    retrying: {e}", flush=True)
            time.sleep(5 * 2 ** attempt)


def categories() -> dict[str, int]:
    """{ISO 639-3 (or whatever the category says): number of files}"""
    out, cont = {}, {}
    while True:
        d = api({"action": "query", "list": "allcategories", "acprefix": PREFIX, "aclimit": 500, "acprop": "size"} | cont)
        for c in d["query"]["allcategories"]:
            out[c["category"][len(PREFIX):]] = c.get("files", c.get("size", 0))
        if "continue" not in d:
            return out
        cont = d["continue"]


def files(iso: str, limit: int = 2000) -> list[str]:
    """The category's latest files, up to limit"""
    out, cont = [], {}
    while len(out) < limit:
        d = api({"action": "query", "list": "categorymembers", "cmtitle": f"Category:{PREFIX}{iso}",
                 "cmtype": "file", "cmlimit": 500, "cmsort": "timestamp", "cmdir": "desc"} | cont)
        out += [m["title"] for m in d["query"]["categorymembers"]]
        if "continue" not in d:
            break
        cont = d["continue"]
    return out[:limit]


def plain(word: str) -> bool:
    """An everyday word rather than a name or a list entry: no capital first letter (in scripts with
    case), no digits or brackets, not too long"""
    return not ((word[:1].isupper() and not word.isupper()) or re.search(r"[\d()\[\]]", word) or len(word) > 24)


def glosses(iso: str) -> dict[str, str]:
    """{Commons file name: English gloss}: Wikidata lexemes in the language whose forms have a Lingua
    Libre recording (P443, pronunciation audio), with the first English gloss of their senses."""
    q = f"""SELECT ?audio (SAMPLE(?g) AS ?gloss) WHERE {{
      ?lang wdt:P220 "{iso}" . ?lexeme dct:language ?lang ; ontolex:lexicalForm ?form ; ontolex:sense ?sense .
      ?form wdt:P443 ?audio . FILTER(CONTAINS(STR(?audio), "LL-Q"))
      ?sense skos:definition ?g . FILTER(LANG(?g) = "en")
    }} GROUP BY ?audio LIMIT 400"""
    url = WDQS + "?" + urllib.parse.urlencode({"query": q, "format": "json"})
    try:
        rows = json.loads(fetch(url, cache=False))["results"]["bindings"]
    except Exception as e:
        print(f"    no glosses for {iso}: {e}", flush=True)
        return {}
    out = {}
    for r in rows:
        name = urllib.parse.unquote(r["audio"]["value"].rsplit("/", 1)[-1]).replace("_", " ")
        out["File:" + name] = r["gloss"]["value"]
    return out


def mp3s(titles: list[str]) -> dict[str, str]:
    """{file: URL of Commons' MP3 transcode} (the original WAV is several times larger)"""
    out = {}
    for i in range(0, len(titles), 50):
        d = api({"action": "query", "titles": "|".join(titles[i:i + 50]), "prop": "videoinfo",
                 "viprop": "derivatives|url"})
        for p in d["query"]["pages"]:
            info = (p.get("videoinfo") or [{}])[0]
            mp3 = next((x["src"] for x in info.get("derivatives", []) if x.get("type", "").startswith("audio/mpeg")), None)
            out[p["title"]] = mp3 or info.get("url")
    return out


def main(argv=None):
    cats = categories()
    print(f"{len(cats)} Lingua Libre language categories, {sum(cats.values()):,} files", flush=True)
    rows, done = [], set()
    for iso, n in sorted(cats.items(), key=lambda kv: -kv[1]):
        code = to_ltdi(iso)
        if not code or not n or code in done:
            continue  # several categories for one language (Quechua's): the largest
        done.add(code)
        parsed = []
        for t in files(iso):
            m = NAME.match(t)
            if m:
                parsed.append((t, m.group(2), m.group(3)))
        if not parsed:
            continue
        g = glosses(iso)
        speakers = Counter(sp for _, sp, _ in parsed)
        # the speaker with most glossed words (else most words) reads them all, where they can
        by_speaker = defaultdict(list)
        for t, sp, word in parsed:
            by_speaker[sp].append((t, word))
        voice = max(by_speaker, key=lambda sp: (sum(t in g for t, _ in by_speaker[sp]),
                                                sum(plain(w) for _, w in by_speaker[sp]), len(by_speaker[sp])))
        pick = sorted(by_speaker[voice], key=lambda tw: (tw[0] not in g, not plain(tw[1]),
                                                          hashlib.md5(tw[0].encode()).hexdigest()))[:CLIPS]
        urls = mp3s([t for t, _ in pick])
        for t, word in pick:
            rows.append({"language": code, "iso": iso, "file": t[5:], "mp3": urls.get(t) or "", "transcription": word,
                         "gloss": g.get(t, ""), "speaker": voice, "recordings": n, "speakers": len(speakers)})
        print(f"  {iso} -> {code}: {n} files, {len(speakers)} speakers in the latest {len(parsed)}, "
              f"{len(g)} glossed; {voice}: {', '.join(w + (' (' + g[t] + ')' if t in g else '') for t, w in pick)}", flush=True)
        time.sleep(0.5)  # gently: Wikimedia's APIs ask for serial, unhurried clients
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {OUT}: {len(rows)} clips for {len({r['language'] for r in rows})} languages")


if __name__ == "__main__":
    sys.exit(main())
