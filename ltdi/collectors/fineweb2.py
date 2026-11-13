"""FineWeb-2: filtered web text, words per language (train split, all scripts).

Also FineWeb-2's published share of each language's documents from Bible-related sites
(bible_ratio), which narrows what the word count means: for 1,266 of its 1,795 subsets most
documents come from Bible sites.

FineWeb-2 covers non-English languages only; English is in FineWeb.
"""

from __future__ import annotations

import csv
import io

from ..http import fetch_text
from ..records import Record
from . import sum_by_language
from ._common import ltdi_codes

URL = "https://raw.githubusercontent.com/huggingface/fineweb-2/main/fineweb2-language-distribution.csv"


def _share(r: dict, col: str) -> float:
    try:
        return float(r[col])
    except (KeyError, ValueError):
        return 0.0


def collect() -> list[Record]:
    rows = [r for r in csv.DictReader(io.StringIO(fetch_text(URL)))
            if r["split"] == "train" and not r["subset"].endswith("_removed") and r["words"] not in ("", "-")]
    words = sum_by_language((r["code"], float(r["words"])) for r in rows)
    # FineWeb-2's own share of each subset's documents from Bible- and Wikipedia-related sites,
    # averaged over a language's subsets by their words
    bible = sum_by_language((r["code"], float(r["words"]) * _share(r, "bible_ratio")) for r in rows)
    wiki = sum_by_language((r["code"], float(r["words"]) * _share(r, "wiki_ratio")) for r in rows)
    out = []
    for code in ltdi_codes():
        if code == "en":
            out.append(Record(
                "en", "web_text_words", 1e12, "words", "FineWeb", URL, method="manual",
                note="English is not in FineWeb-2; FineWeb (English) holds ~15T tokens. "
                     "Recorded at a nominal 1T words, above the goalpost maximum.",
            ))
            continue
        out.append(Record(code, "web_text_words", words.get(code, 0.0), "words", "FineWeb-2", URL,
                          note="Train split, all scripts summed"))
        if words.get(code):
            b, w = bible.get(code, 0.0) / words[code], wiki.get(code, 0.0) / words[code]
            out.append(Record(code, "web_text_bible_share", round(b, 3), "share", "FineWeb-2", URL,
                              note=f"FineWeb-2's share of the documents from Bible-related sites; "
                                   f"{w:.0%} are from Wikipedia-related sites"))
    return out
