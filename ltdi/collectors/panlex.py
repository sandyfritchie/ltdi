"""Lexical translations from PanLex (panlex.org), a CC0 database of words and their translations
gathered from about 2,500 dictionaries and word lists.

PanLex's own download and API are no longer online, and the project stopped updating with its March 2024
database dump. That dump is kept, one file per language, as the Hugging Face dataset
cointegrated/panlex-meanings (pinned below), which this reads: each row is an expression (a word or
phrase) with one of its meanings, and expressions in different languages that share a meaning translate
each other.

  lexicon_panlex   distinct expressions in the language with at least one meaning, across its varieties

About 4 GB in all, so it runs on GitHub Actions (Actions -> PanLex -> Run workflow), or here:
  python -m ltdi.collectors panlex
"""

from __future__ import annotations

import io
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from ..crosswalk import to_ltdi
from ..http import USER_AGENT, note
from ..records import Record

DATASET = "cointegrated/panlex-meanings"
REVISION = "0422f0e60f39a5ed9306ee637555789fdc5b5837"  # pinned: the 2024-03-01 PanLex dump
TREE = f"https://huggingface.co/api/datasets/{DATASET}/tree/{REVISION}/data?expand=false"
FILE = f"https://huggingface.co/datasets/{DATASET}/resolve/{REVISION}/data/{{name}}"
PAGE = "https://vocab.panlex.org/{uid}"
SOURCE = "PanLex (2024-03-01 dump)"


def _open(url: str):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=300)


def files() -> list[dict]:
    out, url = [], TREE
    while url:
        with _open(url) as r:
            out += json.load(r)
            m = re.search(r'<([^>]+)>;\s*rel="next"', r.headers.get("link") or "")
        url = m.group(1) if m else None
    return [f for f in out if f["path"].endswith(".tsv")]


def count(name: str) -> tuple[str, int, int, list[str]]:
    """One language's file: (its ISO 639-3 code, distinct expressions, rows, its varieties' PanLex ids)."""
    exprs, rows, uids = set(), 0, set()
    with _open(FILE.format(name=name)) as r:
        lines = io.TextIOWrapper(r, encoding="utf-8")
        head = next(lines).rstrip("\n").split("\t")
        it, iu = head.index("txt"), head.index("langvar_uid")
        for line in lines:
            parts = line.rstrip("\n").split("\t")
            if len(parts) <= max(it, iu):
                continue
            rows += 1
            exprs.add(parts[it])
            uids.add(parts[iu])
    return name.removesuffix(".tsv"), len(exprs), rows, sorted(uids)


def collect() -> list[Record]:
    fs = files()
    if len(fs) < 7000:
        raise RuntimeError(f"panlex: only {len(fs)} files listed in {TREE}")
    note(f"https://huggingface.co/datasets/{DATASET}@{REVISION}", REVISION, __import__("datetime").date.today().isoformat())
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(count, [f["path"].split("/")[-1] for f in fs]))
    best: dict[str, tuple[int, int, list[str], str]] = {}
    for iso, n, rows, uids in results:
        code = to_ltdi(iso)
        if code and n and n > best.get(code, (0,))[0]:  # a macrolanguage and a member can share a code: the larger
            best[code] = (n, rows, uids, iso)
    return [Record(code, "lexicon_panlex", n, "expressions", SOURCE, PAGE.format(uid=uids[0] if uids else iso + "-000"),
                   note=f"{n:,} expressions with {rows:,} meanings, in {len(uids)} {'variety' if len(uids) == 1 else 'varieties'}")
            for code, (n, rows, uids, iso) in sorted(best.items())]
