"""FineWeb-2: filtered web text, words per language (train split, all scripts).

Also FineWeb-2's published share of each language's documents from Bible-related sites
(bible_ratio), which narrows what the word count means: for 1,266 of its 1,795 subsets most
documents come from Bible sites.

FineWeb-2 covers non-English languages only; English is in FineWeb.

Where MADLAD-400 (Google's audited web corpus, also from Common Crawl) holds more words for a language
than FineWeb-2, its count is used instead (config/madlad_words.csv, counted with tools/text_words.py),
with its auditors' notes on Bible and jw.org text standing in for the Bible share. Where HPLT 3.0 (the
HPLT project's web text from the Internet Archive and Common Crawl, CC0) holds more than either, its
count is used (config/hplt_words.csv, estimated with tools/hplt_words.py); HPLT publishes no Bible
share, so FineWeb-2's (or MADLAD-400's notes) stands in. The three overlap, so they're never added together.
"""

from __future__ import annotations

import csv
import io

from .. import CONFIG
from ..http import fetch_text
from ..records import Record
from . import sum_by_language
from ._common import ltdi_codes

MADLAD = "https://huggingface.co/datasets/allenai/MADLAD-400"
HPLT = "https://hplt-project.org/datasets/v3.0"
URL = "https://raw.githubusercontent.com/huggingface/fineweb-2/d0defb24f193bb9a5a11b8b14524a03c4858e1b6/fineweb2-language-distribution.csv"


def _share(r: dict, col: str) -> float:
    try:
        return float(r[col])
    except (KeyError, ValueError):
        return 0.0


def madlad() -> dict[str, tuple[float, float, str]]:
    """code -> (words, Bible share, auditors' notes) from config/madlad_words.csv."""
    path = CONFIG / "madlad_words.csv"
    if not path.exists():
        return {}
    out: dict[str, list] = {}
    with path.open(encoding="utf-8") as f:
        for r in csv.DictReader(l for l in f if not l.startswith("#")):
            w, b = float(r["words"]), float(r["bible_share"])
            x = out.setdefault(r["language"], [0.0, 0.0, []])
            x[0] += w
            x[1] += w * b
            x[2].append(r["audit_note"])
    return {c: (w, bw / w if w else 0.0, "; ".join(n for n in notes if n)) for c, (w, bw, notes) in out.items()}


def hplt() -> dict[str, float]:
    """code -> words, from config/hplt_words.csv (a language's scripts summed)."""
    path = CONFIG / "hplt_words.csv"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        return sum_by_language((r["language"], float(r["words"])) for r in csv.DictReader(l for l in f if not l.startswith("#")))


def collect() -> list[Record]:
    rows = [r for r in csv.DictReader(io.StringIO(fetch_text(URL)))
            if r["split"] == "train" and not r["subset"].endswith("_removed") and r["words"] not in ("", "-")]
    words = sum_by_language((r["code"], float(r["words"])) for r in rows)
    # FineWeb-2's own share of each subset's documents from Bible- and Wikipedia-related sites,
    # averaged over a language's subsets by their words
    bible = sum_by_language((r["code"], float(r["words"]) * _share(r, "bible_ratio")) for r in rows)
    wiki = sum_by_language((r["code"], float(r["words"]) * _share(r, "wiki_ratio")) for r in rows)
    mad = madlad()
    hp = hplt()
    out = []
    for code in ltdi_codes():
        if code == "en":
            out.append(Record(
                "en", "web_text_words", 1e12, "words", "FineWeb", URL, method="manual",
                note="English is not in FineWeb-2; FineWeb (English) holds ~15T tokens. "
                     "Recorded at a nominal 1T words, above the goalpost maximum.",
            ))
            continue
        if hp.get(code, 0.0) > max(words.get(code, 0.0), mad.get(code, (0.0,))[0]):
            others = f"FineWeb-2's {words.get(code, 0.0):,.0f} words" + (f" and MADLAD-400's {mad[code][0]:,.0f}" if code in mad else "")
            out.append(Record(code, "web_text_words", round(hp[code]), "words", "HPLT 3.0", HPLT, method="estimate",
                              note=f"HPLT 3.0 holds more than {others}, so it's used instead; its words are estimated from "
                                   f"its characters, the words per character of up to 100 documents from each quality bin, "
                                   f"and the share of them GlotLID identifies as the language"))
            if words.get(code):  # HPLT publishes no Bible share: FineWeb-2's stands in, so Bible-heavy text still counts for less
                b = bible.get(code, 0.0) / words[code]
                out.append(Record(code, "web_text_bible_share", round(b, 3), "share", "FineWeb-2", URL,
                                  note="FineWeb-2's share of the documents from Bible-related sites, standing in for HPLT 3.0's, "
                                       "which isn't published"))
            elif code in mad:
                out.append(Record(code, "web_text_bible_share", round(mad[code][1], 3), "share", "MADLAD-400 (clean)", MADLAD,
                                  note="From the MADLAD-400 auditors' notes, standing in for HPLT 3.0's, which isn't published"))
            continue
        if code in mad and mad[code][0] > words.get(code, 0.0):
            w, b, notes = mad[code]
            out.append(Record(code, "web_text_words", w, "words", "MADLAD-400 (clean)", MADLAD,
                              note=f"MADLAD-400 holds more than FineWeb-2's {words.get(code, 0.0):,.0f} words, so it's used instead"))
            out.append(Record(code, "web_text_bible_share", round(b, 3), "share", "MADLAD-400 (clean)", MADLAD,
                              note=f"From the MADLAD-400 auditors' notes on a sample: {notes}" if notes else "From the MADLAD-400 auditors' notes"))
            continue
        out.append(Record(code, "web_text_words", words.get(code, 0.0), "words", "FineWeb-2", URL,
                          note="Train split, all scripts summed"))
        if words.get(code):
            b, w = bible.get(code, 0.0) / words[code], wiki.get(code, 0.0) / words[code]
            out.append(Record(code, "web_text_bible_share", round(b, 3), "share", "FineWeb-2", URL,
                              note=f"FineWeb-2's share of the documents from Bible-related sites; "
                                   f"{w:.0%} are from Wikipedia-related sites"))
    return out
