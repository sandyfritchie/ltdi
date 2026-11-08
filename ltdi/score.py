"""Scoring engine: records + methodology config -> per-language indices.

Run:  python -m ltdi.score
Reads data/records/*.csv and data/manual/*.csv, writes data/scores.json.
"""

from __future__ import annotations

import csv
import json
import math
import tomllib
from collections import defaultdict

from . import CONFIG, DATA
from .opportunities import RULES, TEAMS, TYPES, explain, find, rank, reach_by_country, starter_kit
from .records import Record, read_dir


def load_config() -> dict:
    with (CONFIG / "methodology.toml").open("rb") as f:
        return tomllib.load(f)


def normalise(value: float, spec: dict) -> float:
    scale = spec.get("scale", "linear")
    if scale == "bool":
        return 1.0 if value else 0.0
    lo, hi = float(spec["min"]), float(spec["max"])
    if scale == "log":
        v, lo, hi = math.log10(value + 1), math.log10(lo + 1), math.log10(hi + 1)
    else:
        v = value
    return min(1.0, max(0.0, (v - lo) / (hi - lo)))


ANY = 0.25  # credit for any availability; the rest is shared across the services checked


def presence(facts: dict[str, Record], ids: list[str]) -> float:
    """0.25 for being offered at all, plus 0.75 x the share of these services that offer it."""
    n = sum(1 for i in ids if i in facts and facts[i].value)
    return round(ANY + (1 - ANY) * n / len(ids), 3) if n else 0.0


def tier(facts: dict[str, Record], tech: dict) -> float | None:
    """Presence score for a technology (see methodology.toml); None if nothing was collected.

    Commercial services count by share. Without any, an open model alone scores the
    base 0.25. Technologies with no commercial sources (language identification)
    count their open tools by share instead. LLMs combine product availability with
    measured benchmark results (see tech_score).
    """
    consumer, open_ = tech.get("consumer", []), tech.get("open", [])
    if not any(i in facts for i in consumer + open_):
        return None
    if not consumer:
        return presence(facts, open_)
    p = presence(facts, consumer)
    if p == 0 and any(i in facts and facts[i].value for i in open_):
        return ANY
    return p


def measured(facts: dict[str, Record], tech: dict) -> float | None:
    vals = [normalise(facts[i].value, {"scale": "linear", **spec})
            for i, spec in tech.get("measured", {}).items() if i in facts]
    return round(sum(vals) / len(vals), 3) if vals else None


def depth(facts: dict[str, Record], tech: dict) -> float | None:
    """Mean of the technology's depth indicators, each divided by its max; None if none collected.

    A depth indicator named after a service (tts_google_voice_types belongs to tts_google)
    only counts where that service offers the language: its absence is already counted
    in the presence score.
    """
    vals = []
    services = tech.get("consumer", []) + tech.get("open", [])
    for ind, spec in tech.get("depth", {}).items():
        if ind not in facts:
            continue
        owner = max((sv for sv in services if ind.startswith(sv + "_")), key=len, default=None)
        if owner and not (owner in facts and facts[owner].value):
            continue
        if isinstance(spec, dict):  # {min, max}; max < min inverts the scale (e.g. error rates)
            vals.append(normalise(facts[ind].value, {"scale": "linear", **spec}))
        else:  # a plain number is the maximum count
            vals.append(min(1.0, facts[ind].value / spec))
    return sum(vals) / len(vals) if vals else None


def tech_score(facts: dict[str, Record], tech: dict) -> float | None:
    t = tier(facts, tech) if tech.get("consumer") or tech.get("open") else None
    if "measured" in tech:  # LLMs: mean of product availability and benchmark quality, whichever exist
        parts = [v for v in (t, measured(facts, tech)) if v is not None]
        return round(sum(parts) / len(parts), 3) if parts else None
    if t is None or t == 0:
        return t
    d = depth(facts, tech)
    return t if d is None else round((t + d) / 2, 3)


def weighted_mean(parts: list[tuple[float, float]]) -> float:
    total = sum(w for _, w in parts)
    return sum(v * w for v, w in parts) / total if total else 0.0


def score_language(facts: dict[str, Record], cfg: dict) -> dict:
    floor = cfg["meta"]["floor"]
    dims, missing = {}, []

    for key in ("writing", "data"):
        d = cfg["dimensions"][key]
        parts, detail = [], {}
        for ind, spec in d["indicators"].items():
            if ind not in facts:
                missing.append(ind)
                continue
            n = normalise(facts[ind].value, spec)
            parts.append((n, spec["weight"]))
            detail[ind] = round(n, 3)
        dims[key] = {"score": weighted_mean(parts), "indicators": detail}

    t = cfg["dimensions"]["tech"]
    parts, detail = [], {}
    for name, tech in t["technologies"].items():
        s = tech_score(facts, tech)
        if s is None:
            missing.append(name)
            continue
        parts.append((s, tech["weight"]))
        detail[name] = s
    dims["tech"] = {"score": weighted_mean(parts), "indicators": detail}

    for d in dims.values():
        d["raw"] = round(d["score"], 4)
        d["score"] = round(max(floor, d["score"]), 4)
    ltdi = math.prod(d["score"] for d in dims.values()) ** (1 / len(dims))
    return {"ltdi": round(ltdi, 4), "dimensions": dims, "missing": missing}


def main() -> None:
    cfg = load_config()
    records = read_dir(DATA / "records") + read_dir(DATA / "manual")
    by_lang: dict[str, dict[str, Record]] = defaultdict(dict)
    for r in records:
        by_lang[r.language][r.indicator] = r

    langs = json.loads((DATA / "languages.json").read_text(encoding="utf-8"))
    countries: dict[str, dict[str, float]] = defaultdict(dict)
    if (DATA / "countries.csv").exists():
        with (DATA / "countries.csv").open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                countries[row["country"]][row["indicator"]] = float(row["value"])
    results = []
    for lang in langs:
        facts_l = by_lang.get(lang["code"], {})
        s = score_language(facts_l, cfg)
        opps = rank(lang, find(facts_l), s, facts_l)
        for o in opps:
            o["id"] = f"{lang['code']}-{o['key']}"
            o["kit"] = starter_kit(o, facts_l)
            o["why"] = explain(lang, o, facts_l)
        results.append({**lang, **s, "opportunities": opps, "reach_by_country": reach_by_country(lang, countries)})
    results.sort(key=lambda r: -r["ltdi"])
    for i, r in enumerate(results, 1):
        r["rank"] = i

    facts = {
        code: {i: {k: getattr(r, k) for k in ("value", "unit", "source", "url", "retrieved", "method", "note")}
               for i, r in inds.items()}
        for code, inds in by_lang.items()
    }
    labels = {
        **{i: s["label"] for d in ("writing", "data") for i, s in cfg["dimensions"][d]["indicators"].items()},
        **{k: v["label"] for k, v in cfg["dimensions"]["tech"]["technologies"].items()},
        **{k: cfg["dimensions"][k]["label"] for k in ("writing", "data", "tech")},
    }
    history = None
    if (DATA / "history.csv").exists():
        periods: list[str] = []
        hist: dict[str, dict[str, dict[str, int]]] = defaultdict(lambda: defaultdict(dict))
        with (DATA / "history.csv").open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                hist[row["series"]][row["language"]][row["period"]] = int(row["value"])
                if row["period"] not in periods:
                    periods.append(row["period"])
        history = {"periods": sorted(periods), "series": json.loads((DATA / "history_series.json").read_text()),
                   "values": hist}
    out = {"edition": cfg["meta"]["edition"], "labels": labels, "config": cfg, "opportunity_types": TYPES, "teams": TEAMS, "history": history,
           "languages": results, "facts": facts}
    (DATA / "scores.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    for r in results:
        d = r["dimensions"]
        print(f"{r['rank']:>2} {r['code']:<4} {r['name']:<18} LTDI {r['ltdi']:.3f}  "
              f"W {d['writing']['score']:.2f}  D {d['data']['score']:.2f}  T {d['tech']['score']:.2f}")


if __name__ == "__main__":
    main()
