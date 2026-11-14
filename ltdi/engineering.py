"""Engineering flags: things about a language's writing that make building text and speech technology
cost more, from sources the pipeline already reads.

  rtl         written right to left                        CLDR script metadata (rtl)
  shaping     letters change shape with their neighbours   CLDR script metadata (shapingReq = YES)
  nospace     no spaces between words, so text has to be   CLDR script metadata (lbLetters: lines
              segmented into words                          break between letters, not at spaces)
  ime         typed through an input method, not a         CLDR script metadata (ime)
              keyboard layout alone
  scripts     written in more than one script              LinguaMeta (scripts in canonical or
                                                            widespread use)
  lookalike   its web text uses letters from another       FineWeb-2 character sample
              script that look like its own (Greek ε       (data/fineweb_chars.csv)
              for ɛ), so search, spelling and keyboards
              see two spellings of one word

The flags describe the language's main script, plus "scripts" when there are others. Tone or vowel
marks left out in everyday writing, and spelling that varies in practice, also raise cost but aren't
recorded in any source tracked here, so there are no flags for them."""

from __future__ import annotations

import csv
import unicodedata
from functools import lru_cache

from . import DATA
from .collectors.scripts import URL as SCRIPT_METADATA
from .http import fetch_json

FLAGS = {
    "rtl": "Written right to left",
    "shaping": "Complex shaping: letters change form with their neighbours",
    "nospace": "No spaces between words, so text must be split into words",
    "ime": "Typed with an input method, not a keyboard layout alone",
    "scripts": "Written in more than one script",
    "lookalike": "Its web text uses look-alike letters from another script",
}

# Letters of other scripts that pass for Latin ones in running text: what each stands in for
LOOKALIKE = {
    "GREEK": {"ε": "ɛ", "έ": "ɛ́", "ͻ": "ɔ", "Ͻ": "Ɔ", "ί": "í", "ι": "i", "ο": "o", "Ο": "O",
              "υ": "ʋ", "α": "ɑ", "γ": "ɣ", "ν": "v", "Α": "A", "Β": "B", "Ε": "E", "Η": "H", "Ι": "I",
              "Κ": "K", "Μ": "M", "Ν": "N", "Ρ": "P", "Τ": "T", "Χ": "X", "Υ": "Y", "Ζ": "Z"},
    "CYRILLIC": {"а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j",
                 "ѕ": "s", "ԁ": "d", "һ": "h", "є": "ɛ", "Є": "Ɛ", "А": "A", "В": "B", "Е": "E", "К": "K",
                 "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X", "І": "I", "Ј": "J",
                 "Ѕ": "S"},
}
SCRIPT_OF = {"GREEK": "grek", "CYRILLIC": "cyrl"}
MIN_SHARE = 0.005  # of the sample's letters, so a stray quotation doesn't count


@lru_cache(maxsize=1)
def script_metadata() -> dict[str, dict]:
    return {k.lower(): v for k, v in fetch_json(SCRIPT_METADATA)["scriptMetadata"].items()}


def lookalikes() -> dict[str, list[tuple[str, str]]]:
    """{language: [(letter used, letter it stands in for), ...]} where a Latin-script language's web
    text uses another script's letters, every one of which looks like a Latin letter, in at least
    MIN_SHARE of its letters. Whole passages in another script (Russian quoted in Karelian) use letters
    with no Latin look-alike, so they don't count."""
    path = DATA / "fineweb_chars.csv"
    if not path.exists():
        return {}
    langs = {l["code"]: l for l in _languages()}
    out: dict[str, list[tuple[str, str]]] = {}
    for r in csv.DictReader(path.open(encoding="utf-8")):
        if not r["subset"].endswith("_Latn") or r["language"] not in langs:
            continue
        share = {k.lower(): float(v) for k, v in (x.split(":") for x in r["scripts"].split())}
        own = set(langs[r["language"]].get("scripts") or [])
        for block, table in LOOKALIKE.items():
            if share.get(SCRIPT_OF[block], 0) < MIN_SHARE or SCRIPT_OF[block] in own:
                continue
            used = [c for c in r["letters"] if unicodedata.name(c, "").startswith(block)]
            if used and all(c in table for c in used):
                out.setdefault(r["language"], []).extend((c, table[c]) for c in used)
    return out


@lru_cache(maxsize=1)
def _languages() -> list[dict]:
    import json
    return json.loads((DATA / "languages.json").read_text(encoding="utf-8"))


def flags(lang: dict, meta: dict[str, dict], looks: dict[str, list]) -> list[str]:
    scripts = lang.get("scripts") or []
    out = []
    m = meta.get(scripts[0]) if scripts else None
    if m:
        if m.get("rtl") == "YES":
            out.append("rtl")
        if m.get("shapingReq") == "YES":
            out.append("shaping")
        if m.get("lbLetters") == "YES":
            out.append("nospace")
        if m.get("ime") == "YES":
            out.append("ime")
    if len(scripts) > 1:
        out.append("scripts")
    if lang["code"] in looks:
        out.append("lookalike")
    return out


def all_flags(languages: list[dict]) -> dict[str, dict]:
    """{language: {"flags": [...], "lookalikes": [[used, stands for], ...]}} for languages with any flag."""
    meta, looks = script_metadata(), lookalikes()
    out = {}
    for l in languages:
        f = flags(l, meta, looks)
        if f:
            out[l["code"]] = {"flags": f, **({"lookalikes": [list(p) for p in looks[l["code"]]]} if l["code"] in looks else {})}
    return out
