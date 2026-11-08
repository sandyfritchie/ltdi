"""Map source language labels (zh-CN, swh_Latn, arb, pa-IN...) to LTDI codes.

Resolution order for a label:
1. Explicit row in config/crosswalk.csv (ltdi "-" means: deliberately excluded)
2. Exact LTDI code, or the language's ISO 639-3 code
3. A member of a macrolanguage in scope (swh -> sw, quy -> qu), except Arabic,
   where only Modern Standard Arabic is credited (dialects are excluded)
4. The label's first subtag, run through steps 1-3 again
Labels that don't resolve return None and are skipped by collectors.
"""

from __future__ import annotations

import csv
import json
import re
from functools import lru_cache

from . import CONFIG, DATA

# Macrolanguages whose individual members should NOT be credited to the macro
NO_MEMBER_ROLLUP = {"ar"}


@lru_cache(maxsize=1)
def _table() -> dict[str, str | None]:
    langs = json.loads((DATA / "languages.json").read_text(encoding="utf-8"))
    table: dict[str, str | None] = {}
    for lang in langs:
        code = lang["code"]
        table[code.lower()] = code
        if lang.get("iso_639_3"):
            table[lang["iso_639_3"].lower()] = code
        if code not in NO_MEMBER_ROLLUP:
            for m in lang.get("members", []):
                table.setdefault(m.lower(), code)
    with (CONFIG / "crosswalk.csv").open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            table[row["label"].lower()] = None if row["ltdi"] == "-" else row["ltdi"]
    return table


def _norm(label: str) -> str:
    return label.strip().lower().replace("_", "-")


def to_ltdi(label: str) -> str | None:
    table = _table()
    key = _norm(label)
    if key in table:
        return table[key]
    base = re.split(r"-", key)[0]
    return table.get(base)
