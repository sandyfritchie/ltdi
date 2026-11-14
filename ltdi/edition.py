"""An edition's scores as a table: data/editions/<edition>.csv, one row per language, and
<edition>.json beside it saying which method and which records produced them (hashes of the config
and of every records file), so editions can be compared and re-scored. Written by ltdi.score;
committed, and published on the site for download."""

from __future__ import annotations

import csv
import hashlib
import io
import json

from . import CONFIG, DATA

LICENCE = "CC BY-SA 4.0"
COLUMNS = {
    "rank": "Rank among living languages; languages with the same score share a rank. Empty for extinct languages",
    "tied": "How many other languages share this rank",
    "code": "LTDI code (BCP 47, from LinguaMeta)",
    "iso_639_3": "ISO 639-3 code",
    "name": "English name",
    "speakers": "Speakers recorded (LinguaMeta; Wikipedia where it has none)",
    "ltdi": "Language Technology Development Index: sqrt(technology x data), each dimension floored",
    "tier": "Tier: Very high, High, Medium by score; below Medium, by what's recorded",
    "technology": "Technology dimension, 0 to 1, after the floor",
    "data": "Data dimension, 0 to 1, after the floor",
    "technology_unfloored": "Technology dimension before the floor (used to break ties in the rank)",
    "data_unfloored": "Data dimension before the floor",
    "written_in": "For a spoken variety: the standard language its speakers write",
    "through_standard_ltdi": "For a spoken variety: the LTDI counting its written standard's resources",
    "through_standard_tier": "For a spoken variety: the tier through its written standard",
}


def cite(cfg: dict) -> str:
    m = cfg["meta"]
    return (f"Ritchie, Sandy ({m['edition'][:4]}). Language Technology Development Index (LTDI), edition {m['edition']} "
            f"(methodology {m['methodology_version']}). https://langtechindex.org")


def _sha(paths) -> str:
    h = hashlib.sha256()
    for p in sorted(paths):
        h.update(p.name.encode() + b"\0" + p.read_bytes())
    return h.hexdigest()


def write_edition(results: list[dict], cfg: dict) -> None:
    edition = cfg["meta"]["edition"]
    techs = list(cfg["dimensions"]["tech"]["technologies"])
    labels = {t: cfg["dimensions"]["tech"]["technologies"][t]["label"] for t in techs}
    tier_label = {k: t for k, t, *_ in cfg["tiers"]["cutoffs"]} | {k: t for k, t, *_ in cfg["tiers"]["stages"]}
    cols = [*COLUMNS][:12] + [f"tech_{t}" for t in techs] + [*COLUMNS][12:]
    r4 = lambda v: "" if v is None else f"{v:.4f}"
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(cols)
    for r in results:
        d, via = r["dimensions"], r.get("via")
        w.writerow([r["rank"] or "", r["tied"] if r["rank"] else "", r["code"], r.get("iso_639_3") or "", r["name"],
                    int(r["speakers"]) if r.get("speakers") else "", r4(r["ltdi"]), tier_label.get(r["tier"], r["tier"]),
                    r4(d["tech"]["score"]), r4(d["data"]["score"]),
                    r4(d["tech"].get("raw", d["tech"]["score"])), r4(d["data"].get("raw", d["data"]["score"])),
                    *(r4(d["tech"]["indicators"].get(t)) for t in techs),
                    r.get("written_in") if via else "", r4(via["ltdi"]) if via else "",
                    tier_label.get(via["tier"], via["tier"]) if via else ""])
    out = DATA / "editions"
    out.mkdir(exist_ok=True)
    (out / f"{edition}.csv").write_text(buf.getvalue(), encoding="utf-8")
    meta = {
        "edition": edition,
        "methodology_version": cfg["meta"]["methodology_version"],
        "languages": len(results),
        "ranked": sum(1 for r in results if r["rank"]),
        "licence": LICENCE,
        "cite": cite(cfg),
        "config_sha256": _sha(CONFIG.glob("*")),
        "records_sha256": _sha([*(DATA / "records").glob("*.csv"), *(DATA / "manual").glob("*.csv"), DATA / "languages.json"]),
        "columns": {**{c: COLUMNS[c] for c in [*COLUMNS][:12]},
                    **{f"tech_{t}": f"{labels[t]}, 0 to 1" for t in techs},
                    **{c: COLUMNS[c] for c in [*COLUMNS][12:]}},
    }
    (out / f"{edition}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote data/editions/{edition}.csv ({meta['ranked']:,} ranked of {meta['languages']:,})")
