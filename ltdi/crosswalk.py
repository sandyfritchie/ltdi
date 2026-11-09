"""Map source language labels (zh-CN, swh_Latn, arb, pa-IN...) to LTDI codes.

Resolution order for a label:
1. Explicit row in config/crosswalk.csv (ltdi "-" means: deliberately excluded)
2. Exact LTDI code, or a language's ISO 639-3 code
3. A member absorbed by a macrolanguage scored as one language (swh -> sw, arb -> ar),
   per config/macrolanguages.csv
4. A macrolanguage represented by its members: its label_to member (zh -> cmn, no -> nb),
   or else its most-spoken member
5. The label's first subtag, run through steps 1-4 again
Labels that don't resolve return None and are skipped by collectors.
"""

from __future__ import annotations

import csv
import json
import re
from functools import lru_cache

from . import CONFIG, DATA


@lru_cache(maxsize=1)
def _table() -> dict[str, str | None]:
    langs = json.loads((DATA / "languages.json").read_text(encoding="utf-8"))
    in_scope = {l["code"] for l in langs}
    table: dict[str, str | None] = {}
    for lang in langs:
        table[lang["code"].lower()] = lang["code"]
        if lang.get("iso_639_3"):
            table.setdefault(lang["iso_639_3"].lower(), lang["code"])
    with (CONFIG / "macrolanguages.csv").open(encoding="utf-8") as f:
        macros = {r["macro"]: r for r in csv.DictReader(f)}
    for m, r in macros.items():
        for member in r["absorbs"].split():
            table.setdefault(member, m)
        if m not in in_scope and r["label_to"]:
            table.setdefault(m, r["label_to"])
    try:  # other macrolanguages represented by members: credit the most-spoken member in scope
        from .backbone import records
        recs = records()
        pop = {c: d.get("total_population") or 0 for c, d in recs.items()}
        for c, d in recs.items():
            if d.get("language_scope", {}).get("scope") == "MACROLANGUAGE" and c not in in_scope and c not in table:
                members = [m for m in d.get("individual_language_bcp_47_codes", []) if m in in_scope]
                if members and c not in macros:
                    table[c] = max(members, key=lambda m: pop.get(m, 0))
                if d.get("iso_639_3_code") and c in table:
                    table.setdefault(d["iso_639_3_code"], table[c])
    except Exception:
        pass
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
