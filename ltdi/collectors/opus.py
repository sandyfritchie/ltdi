"""Parallel text with English, from OPUS (opus.nlpl.eu): sentence pairs summed over
the latest version of every corpus for the pair.

  parallel_sentences   sentence pairs with English (corpora overlap, so this is an upper bound)

Web-mined corpora (CCMatrix, CCAligned, NLLB, WikiMatrix, ...) are counted and
their share given in the note. English itself is recorded at a nominal value.

Run:  python -m ltdi.collectors opus   (needs opus.nlpl.eu)
"""

from __future__ import annotations

import json

from .. import DATA
from ..http import fetch_json
from ..records import Record
from ._common import ltdi_codes

API = "https://opus.nlpl.eu/opusapi/?source={a}&target={b}&preprocessing=moses&version=latest"
MINED = {"CCMatrix", "CCAligned", "MultiCCAligned", "NLLB", "WikiMatrix", "HPLT", "MaCoCu", "ParaCrawl"}
OPUS_CODE = {"cmn": "zh"}  # LTDI code -> OPUS code where they differ
ENGLISH_NOMINAL = 1e9


def pairs(code: str) -> tuple[int, int, int]:
    a, b = sorted(["en", OPUS_CODE.get(code, code)])
    corpora = fetch_json(API.format(a=a, b=b)).get("corpora", [])
    total = mined = 0
    for c in corpora:
        n = c.get("alignment_pairs")
        if isinstance(n, int):
            total += n
            mined += n if c["corpus"] in MINED else 0
    return total, mined, len(corpora)


def collect() -> list[Record]:
    out = []
    for code in ltdi_codes():
        if code == "en":
            out.append(Record(code, "parallel_sentences", ENGLISH_NOMINAL, "sentence pairs", "OPUS",
                              "https://opus.nlpl.eu/", note="English is the pivot; recorded at a nominal value"))
            continue
        total, mined, n = pairs(code)
        share = f"{mined / total:.0%} web-mined" if total else ""
        out.append(Record(code, "parallel_sentences", total, "sentence pairs", "OPUS",
                          f"https://opus.nlpl.eu/results/en&{OPUS_CODE.get(code, code)}/corpus-result-table",
                          note=f"{n} corpora" + (f"; {share}" if share else "")))
    return out
