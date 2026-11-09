"""Parallel text with English, from OPUS (opus.nlpl.eu): sentence pairs summed over
the latest version of every corpus for the pair.

  parallel_sentences   sentence pairs with English (corpora overlap, so this is an upper bound)

OPUS lists the languages it pairs with English (about a thousand labels, some with script or region
suffixes such as zh_CN or aeb_arab). Every label that resolves to an LTDI language is queried; when
several labels share a corpus, the corpus counts once, at its largest. Languages OPUS does not list
have no parallel text there and are recorded as 0.

Web-mined corpora (CCMatrix, CCAligned, NLLB, WikiMatrix, ...) are counted and their share given in
the note. English itself is recorded at a nominal value.

Run:  python -m ltdi.collectors opus   (needs opus.nlpl.eu)
"""

from __future__ import annotations

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from ..crosswalk import to_ltdi
from ..http import fetch_json
from ..records import Record
from ._common import ltdi_codes

LANGUAGES = "https://opus.nlpl.eu/opusapi/?source=en&languages=True"
API = "https://opus.nlpl.eu/opusapi/?source={a}&target={b}&preprocessing=moses&version=latest"
MINED = {"CCMatrix", "CCAligned", "MultiCCAligned", "NLLB", "WikiMatrix", "HPLT", "MaCoCu", "ParaCrawl"}
ENGLISH_NOMINAL = 1e9


def corpora(label: str) -> dict[str, int]:
    a, b = sorted(["en", label])
    out = {}
    for c in fetch_json(API.format(a=a, b=b)).get("corpora", []):
        n = c.get("alignment_pairs")
        if isinstance(n, int):
            out[c["corpus"]] = max(out.get(c["corpus"], 0), n)
    return out


def collect() -> list[Record]:
    labels: dict[str, list[str]] = defaultdict(list)
    for label in fetch_json(LANGUAGES)["languages"]:
        code = to_ltdi(label.replace("_", "-"))
        if code and code != "en":
            labels[code].append(label)
    flat = sorted({l for ls in labels.values() for l in ls})
    with ThreadPoolExecutor(8) as pool:
        by_label = dict(zip(flat, pool.map(corpora, flat)))
    out = []
    for code in ltdi_codes():
        if code == "en":
            out.append(Record(code, "parallel_sentences", ENGLISH_NOMINAL, "sentence pairs", "OPUS",
                              "https://opus.nlpl.eu/", note="English is the pivot; recorded at a nominal value"))
            continue
        merged: dict[str, int] = {}
        for label in labels.get(code, []):
            for name, n in by_label[label].items():
                merged[name] = max(merged.get(name, 0), n)
        total = sum(merged.values())
        mined = sum(n for name, n in merged.items() if name in MINED)
        first = labels[code][0] if labels.get(code) else code
        note = []
        if merged:
            note.append(f"{len(merged)} corpora")
        if mined:
            note.append(f"{mined / total:.0%} web-mined")
        if len(labels.get(code, [])) > 1:
            note.append("OPUS codes " + ", ".join(sorted(labels[code])))
        out.append(Record(code, "parallel_sentences", total, "sentence pairs", "OPUS",
                          f"https://opus.nlpl.eu/results/en&{first}/corpus-result-table", note="; ".join(note)))
    return out
