"""FineWeb-2: filtered web text, words per language (train split, all scripts).

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


def collect() -> list[Record]:
    rows = csv.DictReader(io.StringIO(fetch_text(URL)))
    pairs = (
        (r["code"], float(r["words"]))
        for r in rows
        if r["split"] == "train" and not r["subset"].endswith("_removed") and r["words"] not in ("", "-")
    )
    words = sum_by_language(pairs)
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
    return out
