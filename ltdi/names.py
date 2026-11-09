"""Language names, as vendors print them, resolved to LTDI codes.

Uses every English name LinguaMeta records for a language (from ISO 639, CLDR and others). A name
shared by several languages goes to the most-spoken one. A parenthesised qualifier is tried first
as part of the name ("Chinese (Cantonese)"), then dropped ("Arabic (Egypt)" -> Arabic). Names
LinguaMeta does not record, or records for another language, are in config/language_names.csv.
"""

from __future__ import annotations

import csv
import re
import unicodedata
from functools import lru_cache

from . import ROOT
from .crosswalk import to_ltdi


def norm(name: str) -> str:
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    name = re.sub(r"[‘’'`]", "", name.lower())
    return re.sub(r"[^a-z0-9()]+", " ", name).strip()


@lru_cache(maxsize=None)
def _table() -> dict[str, str]:
    from .backbone import records

    best: dict[str, tuple[int, str]] = {}
    for rec in records().values():
        code = to_ltdi(rec["bcp_47_code"])
        if not code:
            continue
        pop = rec.get("total_population") or 0
        for n in rec.get("name_data", []):
            if n.get("bcp_47_code") == "en":
                key = norm(n["name"])
                rank = (2 if n.get("is_canonical") else 1, pop)
                if key not in best or rank > best[key][0]:
                    best[key] = (rank, code)
    table = {k: c for k, (_, c) in best.items()}
    with open(ROOT / "config" / "language_names.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            table[norm(row["name"])] = row["ltdi"] if row["ltdi"] != "-" else ""
    return table


def resolve(name: str) -> str | None:
    """LTDI code for a vendor's language name; "" if config says it is not a language we score, None if unknown."""
    t = _table()
    name = re.split(r"\s+[\u2014\u2013]\s+|\*", name)[0]  # "Chinese (Simplified) — Pinyin", "Hindi*"
    tries = [name]
    if "," in name:  # "Albanian, Gheg" -> "Gheg Albanian"; "Ahirani, Transliteration" -> "Ahirani"
        head, tail = (s.strip() for s in name.split(",", 1))
        tries += [f"{tail} {head}", head]
    for n in tries:
        key = norm(n)
        if key in t:
            return t[key]
        base = norm(re.sub(r"\(.*?\)|\[.*?\]", " ", n))
        for k in (base, re.sub(r"^(modern|standard) ", "", base)):
            if k and k in t:
                return t[k]
    return None
