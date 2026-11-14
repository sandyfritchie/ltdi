"""A stable data interface: one JSON file per language, at a fixed address, with a published schema.

    site/api/v1/index.json                 every language: code, name, score, rank, tier, file
    site/api/v1/languages/<code>.json      one language: scores, technologies, values, flags, family,
                                           countries and locales, opportunities
    site/api/v1/services.json              the services and benchmarks checked, by technology
    site/api/v1/indicators.json            each indicator's unit and usual note
    site/api/v1/sources.json               each source a value comes from
    site/api/v1/schema.json                JSON Schema for the language files

Served by GitHub Pages at https://langtechindex.org/api/v1/..., which allows requests from any site.
The files are generated when the site is published (pages.yml runs python -m ltdi.api), not committed:
they come entirely from the committed data and config, and would add 40 MB to the repository each edition.

Stability: within v1, fields are only added, never renamed or removed, and their meanings don't change.
Values change with each edition (the "edition" field says which); a change of method raises
"methodology_version". Anything that would break a reader goes to /api/v2/, with v1 kept for at least
one edition alongside it. Written by build_site, so it always matches the site."""

from __future__ import annotations

import csv
import json
import re
import shutil
from collections import Counter

from . import DATA

API_VERSION = "1.0"
BASE = "https://langtechindex.org/api/v1"
SITE_URL = "https://langtechindex.org"


def _dump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def write_api(site, scores: dict, flags: dict, families: tuple[dict, set], gnames: dict[str, str]) -> int:
    """Write site/api/v1; returns the number of language files."""
    out = site / "api" / "v1"
    shutil.rmtree(out, ignore_errors=True)
    (out / "languages").mkdir(parents=True)
    cfg = scores["config"]
    meta = {"api_version": API_VERSION, "edition": scores["edition"],
            "methodology_version": cfg["meta"].get("methodology_version"), "schema": f"{BASE}/schema.json"}
    about = {"licence": "CC BY-SA 4.0", "documentation": f"{SITE_URL}/#about",
             "cite": f"Ritchie, Sandy (2026). Language Technology Development Index (LTDI), edition {scores['edition']}. {SITE_URL}",
             "stability": "Within v1, fields are only added, never renamed or removed, and their meanings don't change. "
                          "Values change with each edition; a change of method raises methodology_version. "
                          "Breaking changes go to /api/v2/, with v1 kept alongside it for at least one edition."}
    techs = cfg["dimensions"]["tech"]["technologies"]
    tier_label = {k: t for k, t, *_ in cfg["tiers"]["cutoffs"]} | {k: t for k, t, *_ in cfg["tiers"]["stages"]}
    rr = {}
    if (DATA / "sensitivity.csv").exists():
        rr = {r["code"]: [int(r["rank_p5"]), int(r["rank_p95"])] for r in csv.DictReader((DATA / "sensitivity.csv").open(encoding="utf-8"))}
    fam, isolates = families
    from .build_site import what_label
    from .demand import STATUS_LABEL, country_literacy, language_literacy, official
    from .organisations import for_language
    off, lit, clit, label = official(), language_literacy(), country_literacy(), what_label(scores)

    # shared tables: sources (url may hold {lang}), and each indicator's unit and most common note
    sources: dict[tuple, int] = {}
    notes: dict[str, Counter] = {}
    units: dict[str, str] = {}
    for fs in scores["facts"].values():
        for i, f in fs.items():
            units[i] = f["unit"]
            notes.setdefault(i, Counter())[f["note"] or ""] += 1
    usual = {i: c.most_common(1)[0][0] for i, c in notes.items()}

    def fact(code: str, f: dict, i: str) -> dict:
        url = re.sub(rf"(?<=[=:&/#]){re.escape(code)}(?=$|[/&#?])", "{lang}", f["url"])
        sid = sources.setdefault((f["source"], url, f["retrieved"], f["method"]), len(sources))
        return {"value": f["value"], "source": sid, **({"note": f["note"]} if f["note"] and f["note"] != usual[i] else {})}

    index = []
    for l in scores["languages"]:
        code = l["code"]
        fs = scores["facts"].get(code, {})
        p = fam.get(code, [])
        doc = {
            **meta,
            "code": code, "name": l["name"], "autonym": l.get("autonym"), "iso_639_3": l.get("iso_639_3"),
            "glottocode": l.get("glottocode"), "alt_names": l.get("alt_names") or [],
            "speakers": l.get("speakers"), "extinct": bool(l.get("extinct")), "endangerment": l.get("endangerment") or None,
            "family": ({"isolate": True} if code in isolates else
                       {"isolate": False, "path": [{"glottocode": g, "name": gnames.get(g, g)} for g in p]} if p else None),
            "scripts": l.get("scripts") or [],
            "countries": [{"code": c["code"], "speakers": c.get("speakers"), "scripts": c.get("scripts") or [],
                           "census_only": bool(c.get("census_only"))} for c in l["countries"]],
            "locales": [f"{code}-{s.title()}-{c['code'].upper()}" for c in l["countries"] if not c.get("census_only")
                        for s in (c.get("scripts") or (l.get("scripts") or [])[:1])],
            "official_in": {c: STATUS_LABEL[st] for c, st in sorted(off.get(code, {}).items())},
            "literacy": {c["code"]: {"adults": clit.get(c["code"]), **({"in_language": lit[code][c["code"]]} if c["code"] in lit.get(code, {}) else {})}
                         for c in l["countries"] if not c.get("census_only") and c["code"] in clit},
            "organisations": for_language(set(l["offers"]), fs, label),
            "engineering_flags": flags.get(code, {}).get("flags", []),
            **({"lookalike_letters": flags[code]["lookalikes"]} if "lookalikes" in flags.get(code, {}) else {}),
            "score": {"ltdi": l["ltdi"], "rank": l.get("rank"), "tied_with": l.get("tied") or 0,
                      "rank_range_90": rr.get(code), "tier": tier_label.get(l["tier"], l["tier"]),
                      "dimensions": {k: {"score": d["score"], "unfloored": d["raw"]} for k, d in l["dimensions"].items()},
                      **({"through_written_standard": {"standard": l.get("written_in"), "ltdi": l["via"]["ltdi"],
                                                       "tier": tier_label.get(l["via"]["tier"], l["via"]["tier"])}}
                         if l.get("via") else {})},
            "technologies": {t: {"level": l["levels"].get(t), **({"gap": l["gaps"][t]} if l["gaps"].get(t) else {}),
                                 "offered_by": [s for s in l["offers"] if s in _svc_tech(scores, t)]} for t in techs},
            "values": {i: fact(code, f, i) for i, f in fs.items() if not (f["unit"] == "bool" and not f["value"])},
            "opportunities": [{"key": o["key"], "type": o["type"], "technology": o["technology"], "title": o["title"],
                               "why": o.get("why") or o.get("detail"), "priority_now": o.get("priority_now"),
                               "priority_5y": o.get("priority_5y")} for o in l["opportunities"]],
            "links": {"page": f"{SITE_URL}/#lang-{code}", "linguameta": l.get("source")},
        }
        (out / "languages" / f"{code}.json").write_text(_dump(doc), encoding="utf-8")
        index.append({"code": code, "name": l["name"], "iso_639_3": l.get("iso_639_3"), "ltdi": l["ltdi"],
                      "rank": l.get("rank"), "tier": tier_label.get(l["tier"], l["tier"]), "file": f"languages/{code}.json"})

    (out / "index.json").write_text(_dump({**meta, **about, "count": len(index), "languages": index}), encoding="utf-8")
    (out / "services.json").write_text(_dump({**meta, "technologies": {t: techs[t]["label"] for t in techs}, "services": [
        {k: v for k, v in s.items() if v not in ("", None)} for s in scores["services"]]}), encoding="utf-8")
    (out / "indicators.json").write_text(_dump({**meta, "indicators": {
        i: {"unit": units[i], **({"note": usual[i]} if usual[i] else {})} for i in sorted(units)}}), encoding="utf-8")
    (out / "sources.json").write_text(_dump({**meta, "note": "A source's url may contain {lang}: replace it with the language's code.",
        "sources": [{"id": i, "name": k[0], "url": k[1], "retrieved": k[2], "method": k[3]} for k, i in sources.items()]}),
        encoding="utf-8")
    (out / "schema.json").write_text(json.dumps(SCHEMA, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return len(index)


_TECH_SVC: dict[str, set[str]] = {}


def _svc_tech(scores: dict, t: str) -> set[str]:
    if not _TECH_SVC:
        for s in scores["services"]:
            _TECH_SVC.setdefault(s["technology"], set()).add(s["id"])
    return _TECH_SVC.get(t, set())


_num = {"type": ["number", "null"]}
_str = {"type": ["string", "null"]}
SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": f"{BASE}/schema.json",
    "title": "LTDI language file, API v1",
    "description": "One language in the Language Technology Development Index. Within v1, fields are only added, "
                   "never renamed or removed. Values change with each edition; methodology_version changes with the method.",
    "type": "object",
    "required": ["api_version", "edition", "methodology_version", "code", "name", "score", "technologies", "values"],
    "properties": {
        "api_version": {"type": "string"}, "edition": {"type": "string", "description": "YYYY-MM"},
        "methodology_version": _str, "schema": {"type": "string"},
        "code": {"type": "string", "description": "The Index's code: ISO 639-1 where there is one, otherwise ISO 639-3"},
        "name": {"type": "string"}, "autonym": _str, "iso_639_3": _str, "glottocode": _str,
        "alt_names": {"type": "array", "items": {"type": "string"}},
        "speakers": _num, "extinct": {"type": "boolean"},
        "endangerment": {**_str, "description": "UNESCO scale, from LinguaMeta or Glottolog"},
        "family": {"type": ["object", "null"], "description": "Glottolog's classification: the groups above the language, family first",
                   "properties": {"isolate": {"type": "boolean"},
                                  "path": {"type": "array", "items": {"type": "object", "properties": {
                                      "glottocode": {"type": "string"}, "name": {"type": "string"}}}}}},
        "scripts": {"type": "array", "items": {"type": "string"}, "description": "ISO 15924, lower case, main script first"},
        "countries": {"type": "array", "items": {"type": "object", "properties": {
            "code": {"type": "string", "description": "ISO 3166-1 alpha-2, lower case"}, "speakers": _num,
            "scripts": {"type": "array", "items": {"type": "string"}},
            "census_only": {"type": "boolean", "description": "Spoken there by immigrant or diaspora communities, from a census"}}}},
        "locales": {"type": "array", "items": {"type": "string"}, "description": "language-Script-REGION for each country and script in use, leaving out census-only countries"},
        "official_in": {"type": "object", "additionalProperties": {"enum": ["official", "official in practice", "official in a region"]},
                        "description": "Countries where it's official, from Unicode CLDR's territory data"},
        "literacy": {"type": "object", "description": "Adult literacy (%) in each country it's spoken in, and in the language itself where CLDR records it",
                     "additionalProperties": {"type": "object", "properties": {"adults": _num, "in_language": _num}}},
        "organisations": {"type": "array", "description": "Organisations behind its datasets, open models, benchmarks and regional services",
                          "items": {"type": "object", "properties": {"organisation": {"type": "string"}, "kind": {"type": "string"},
                                                                     "url": {"type": "string"}, "what": {"type": "array", "items": {"type": "string"}}}}},
        "engineering_flags": {"type": "array", "items": {"enum": ["rtl", "shaping", "nospace", "ime", "scripts", "lookalike"]}},
        "lookalike_letters": {"type": "array", "items": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 2},
                              "description": "[letter used, letter it stands in for]"},
        "score": {"type": "object", "properties": {
            "ltdi": {"type": "number"}, "rank": {"type": ["integer", "null"]}, "tied_with": {"type": "integer"},
            "rank_range_90": {"type": ["array", "null"], "items": {"type": "integer"}},
            "tier": {"type": "string"}, "dimensions": {"type": "object"},
            "through_written_standard": {"type": "object"}}},
        "technologies": {"type": "object", "additionalProperties": {"type": "object", "properties": {
            "level": {"enum": ["full", "part", "open", "none", None], "description": "full: offered widely; part: by some services; open: open tools only; none"},
            "gap": {"enum": ["none", "open"], "description": "Present where no commercial service offers it: none (nothing) or open (open tools only)"},
            "offered_by": {"type": "array", "items": {"type": "string"}}}}},
        "values": {"type": "object", "description": "Recorded values by indicator (indicators.json); offered-or-not values appear only when offered",
                   "additionalProperties": {"type": "object", "required": ["value", "source"], "properties": {
                       "value": {}, "source": {"type": "integer", "description": "id in sources.json"}, "note": {"type": "string"}}}},
        "opportunities": {"type": "array", "items": {"type": "object"}},
        "links": {"type": "object"},
    },
}


def main() -> None:
    """Write site/api/v1 from data/scores.json (run python -m ltdi.score first)."""
    from .build_site import SITE, add_census
    from .engineering import all_flags
    from .families import paths
    from .glottolog import names
    scores = json.loads((DATA / "scores.json").read_text(encoding="utf-8"))
    add_census(scores)
    n = write_api(SITE, scores, all_flags(scores["languages"]), paths(scores["languages"]), names())
    print(f"wrote {n:,} language files to site/api/v1")


if __name__ == "__main__":
    main()
