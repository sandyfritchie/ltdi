"""Language metadata from QQ (qwanqwa), for what LinguaMeta leaves open.

QQ (Poelman, Chen & de Lhoneux, https://github.com/WPoelman/qwanqwa) merges Glottolog, Wikidata,
LinguaMeta, GlotScript and other sources into one database. LTDI takes from it:
  scripts       the canonical script(s), used only where LinguaMeta gives a language none
  status        living / extinct / historical / constructed (Glottolog), so extinct languages can be
                kept out of the ranking
  endangerment  UNESCO's scale, as QQ gives it (from Glottolog's AES)
  joshi         Joshi et al. (2020)'s resource class, 0-5, for comparison with LTDI's tiers
  ud            whether Universal Dependencies has a treebank

Run:  python -m ltdi.qq   (needs `pip install qwanqwa`; the database ships with the package)
Writes data/qq.csv, which the backbone reads; run the backbone again afterwards.
"""

from __future__ import annotations

import csv
import json
import warnings

from . import DATA

OUT = DATA / "qq.csv"
FIELDS = ["code", "qq_name", "scripts", "status", "endangerment", "joshi", "ud"]


def _enum(v) -> str:
    return v.name.lower() if v is not None and hasattr(v, "name") else ""


def lookup(db, lang: dict):
    from qq import IdType

    for value, kind in ((lang.get("iso_639_3"), IdType.ISO_639_3), (lang.get("glottocode"), IdType.GLOTTOCODE),
                        (lang["code"], IdType.BCP_47)):
        if not value:
            continue
        try:
            r = db.get(value, id_type=kind)
        except Exception:
            r = None
        if r:
            return r
    return None


def scripts(r) -> list[str]:
    """Canonical scripts first, else all listed; historical scripts and the ISO 15924 placeholders
    (unknown, common, inherited, unwritten) left out. Lower case, as LinguaMeta writes them."""
    for group in (r.canonical_scripts or [], r.scripts or []):
        codes = [s.iso_15924.lower() for s in group
                 if s.iso_15924 and not s.is_historical and s.iso_15924 not in ("Zzzz", "Zyyy", "Zinh", "Zxxx")]
        if codes:
            return list(dict.fromkeys(codes))
    return []


def main() -> None:
    from qq import Database

    warnings.simplefilter("ignore")
    db = Database.load()
    langs = json.loads((DATA / "languages.json").read_text(encoding="utf-8"))
    rows, missing = [], 0
    for lang in langs:
        r = lookup(db, lang)
        if not r:
            missing += 1
            continue
        rows.append({
            "code": lang["code"],
            "qq_name": r.name or "",
            "scripts": " ".join(scripts(r)),
            "status": _enum(r.status),
            "endangerment": _enum(r.endangerment_status),
            "joshi": "" if r.joshi_rating is None else r.joshi_rating,
            "ud": int(any(e.label == "Universal Dependencies" for e in (r.external_resources or []))),
        })
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} languages matched in QQ ({missing} not found); wrote {OUT.relative_to(DATA.parent)}")


if __name__ == "__main__":
    main()
