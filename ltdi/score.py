"""Scoring engine: records + methodology config -> per-language indices.

Run:  python -m ltdi.score
Reads data/records/*.csv and data/manual/*.csv, writes data/scores.json.
"""

from __future__ import annotations

import csv
import dataclasses
import json
import math
from collections import defaultdict

from . import CONFIG, DATA
from .config import load_config, services
from .edition import write_edition
from .opportunities import RULES, TEAMS, TYPES, explain, find, rank, reach_by_country, resources, starter_kit
from .records import Record, read_dir


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


def _depth_value(value: float, spec) -> float:
    if isinstance(spec, dict):  # {min, max}; max < min inverts the scale (e.g. error rates)
        return normalise(value, {"scale": "linear", **spec})
    return min(1.0, value / spec)  # a plain number is the maximum count


def owner(ind: str, tech: dict) -> str | None:
    """The service a depth indicator describes (services.csv), or None if it describes the technology."""
    if "depth_owner" in tech:
        return tech["depth_owner"].get(ind)
    services = tech.get("consumer", []) + tech.get("open", [])  # tests pass bare specs: match by name
    return max((sv for sv in services if ind.startswith(sv + "_")), key=len, default=None)


def credit(facts: dict[str, Record], tech: dict, service: str) -> float:
    """How fully one service supports the language: 0 if not at all, 1 if fully.

    A service with depth indicators (features, voice types, translation levels) earns
    half for offering the language and half for the depth it offers, so adding a
    service never lowers a score.
    """
    if not (service in facts and facts[service].value):
        return 0.0
    vals = [_depth_value(facts[i].value, spec) for i, spec in tech.get("depth", {}).items()
            if i in facts and owner(i, tech) == service]
    base = 0.5 + 0.5 * sum(vals) / len(vals) if vals else 1.0
    return base * quality_factor(facts, tech, service)


QUALITY_FLOOR = 0.5  # a service measured as poor still counts this much: it is there, and may improve


def quality_factor(facts: dict[str, Record], tech: dict, service: str) -> float:
    """How much a service counts given its published quality for the language: 1 if unmeasured or good,
    down to QUALITY_FLOOR at or below the poor mark (services.csv: quality, quality_poor, quality_good).
    An unmeasured service keeps full credit, so being measured never helps a language's rivals."""
    spec = tech.get("quality", {}).get(service)
    f = facts.get(spec["indicator"]) if spec else None
    if not f or f.value is None:
        return 1.0
    q = normalise(f.value, {"scale": "linear", "min": spec["poor"], "max": spec["good"]})
    return QUALITY_FLOOR + (1 - QUALITY_FLOOR) * q


def presence(facts: dict[str, Record], tech: dict, ids: list[str], regional: list[str] | None = None) -> float:
    """0.25 for being offered at all, plus 0.75 x the services' mean credit.

    Regional providers (Yandex, Baidu, Sarvam, Sunbird...) count together as one more service, and only
    for a language one of them offers, with the best of their credits: so they can raise a score but
    never dilute the share for languages they don't serve."""
    credits = [credit(facts, tech, i) for i in ids]
    best = max((credit(facts, tech, i) for i in regional or []), default=0.0)
    if best:
        credits.append(best)
    return round(ANY + (1 - ANY) * sum(credits) / len(credits), 3) if any(credits) else 0.0


def tier(facts: dict[str, Record], tech: dict) -> float | None:
    """Presence score for a technology (see methodology.toml); None if nothing was collected.

    Commercial services count by share, each weighted by its own depth. Without any,
    an open model alone scores the base 0.25. Technologies with no commercial sources
    (language identification) count their open tools instead. LLMs combine product
    availability with measured benchmark results (see tech_score).
    """
    consumer, open_, regional = tech.get("consumer", []), tech.get("open", []), tech.get("regional", [])
    if not any(i in facts for i in consumer + open_ + regional):
        return None
    if not consumer:
        return presence(facts, tech, open_)
    p = presence(facts, tech, consumer, regional)
    offered = [i for i in open_ if i in facts and facts[i].value]
    if p == 0 and offered:  # an open model alone: the base credit, discounted by its measured quality
        return round(ANY * max(quality_factor(facts, tech, i) for i in offered), 3)
    return p


def measured(facts: dict[str, Record], tech: dict) -> float | None:
    vals = [normalise(facts[i].value, {"scale": "linear", **spec})
            for i, spec in tech.get("measured", {}).items() if i in facts]
    return round(sum(vals) / len(vals), 3) if vals else None


def depth(facts: dict[str, Record], tech: dict) -> float | None:
    """Mean of the depth indicators that describe the technology rather than one service
    (e.g. a published error rate); None if there are none."""
    vals = [_depth_value(facts[i].value, spec) for i, spec in tech.get("depth", {}).items()
            if i in facts and owner(i, tech) is None]
    return sum(vals) / len(vals) if vals else None


def tech_score(facts: dict[str, Record], tech: dict) -> float | None:
    if "indicator" in tech:  # one measure stands for the technology (locale data: CLDR's coverage level)
        f = facts.get(tech["indicator"])
        return None if f is None else round(normalise(f.value, {"scale": "linear", **tech}), 3)
    t = tier(facts, tech) if tech.get("consumer") or tech.get("open") else None
    if "measured" in tech:
        # LLMs: availability in the official app language lists, discounted by measured benchmark quality
        # like any other service (down to QUALITY_FLOOR); unmeasured counts in full, so being measured
        # never lowers a language below its unmeasured peers. A language the apps don't list but a
        # benchmark has measured counts as offered at the base level: the models do handle it.
        m = measured(facts, tech)
        if m is None:
            return t
        avail = t if t else ANY
        return round(avail * (QUALITY_FLOOR + (1 - QUALITY_FLOOR) * m), 3)
    if t is None or t == 0:
        return t
    d = depth(facts, tech)
    return t if d is None else round((t + d) / 2, 3)


def weighted_mean(parts: list[tuple[float, float]]) -> float:
    total = sum(w for _, w in parts)
    return sum(v * w for v, w in parts) / total if total else 0.0


def _on(f: Record | None) -> bool:
    """Whether a service fact means the language is offered (a benchmark counts when it has a result)."""
    return bool(f) and (f.unit != "bool" or bool(f.value))


def coverage(facts: dict[str, Record], cfg: dict) -> dict:
    """Summaries the site needs for every language without loading its facts:
    levels  per technology: full (at least half the services), part, open (open model only), none
    gaps    main technologies (and any marked gap = true) no commercial service offers: open (open model
            or benchmark only) or none
    offers  ids of the services and benchmarks that cover the language"""
    levels, gaps = {}, {}
    for name, t in cfg["dimensions"]["tech"]["technologies"].items():
        if "indicator" in t:  # locale data: modern coverage is full, basic or moderate part
            v = facts[t["indicator"]].value if t["indicator"] in facts else 0
            levels[name] = "full" if v >= t["max"] else "part" if v > t["min"] else "none"
            continue
        cons, opn, meas = t.get("consumer", []), t.get("open", []), list(t.get("measured", {}))
        reg = t.get("regional", [])
        src = cons or opn
        r = int(any(facts.get(i) and facts[i].value for i in reg))  # regional providers: one more service, when present
        n = sum(1 for i in src if facts.get(i) and facts[i].value) + r
        levels[name] = "full" if n and n / (len(src) + r) >= 0.5 else "part" if n else \
            "open" if cons and any(facts.get(i) and facts[i].value for i in opn) else "none"
        if (t.get("group") != "more" or t.get("gap")) and not any(_on(facts.get(i)) for i in cons + reg):
            gaps[name] = "open" if any(_on(facts.get(i)) for i in opn + meas) else "none"
    offers = [sv["id"] for sv in services() if _on(facts.get(sv["id"]))]
    return {"levels": levels, "gaps": gaps, "offers": offers}


def score_language(facts: dict[str, Record], cfg: dict) -> dict:
    floor = cfg["meta"]["floor"]
    dims, missing = {}, []

    for key in (k for k, d in cfg["dimensions"].items() if "indicators" in d):
        d = cfg["dimensions"][key]
        parts, detail = [], {}
        for ind, spec in d["indicators"].items():
            if ind not in facts:
                missing.append(ind)
                continue
            n = normalise(facts[ind].value, spec)
            if spec.get("narrowed_by") in facts:  # e.g. web text mostly from Bible sites counts down to half
                share = min(1.0, max(0.0, facts[spec["narrowed_by"]].value))
                n *= 1 - (1 - spec.get("narrow_floor", 0.5)) * share
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


def written_standards() -> dict[str, str]:
    """Spoken variety -> the language its speakers write (config/written_standards.csv)."""
    with (CONFIG / "written_standards.csv").open(encoding="utf-8") as f:
        return {r["code"]: r["standard"] for r in csv.DictReader(f)}


def shares_written_form() -> set[str]:
    """Varieties whose written form is the standard itself (Dari's is Persian as written in
    Afghanistan), so sources label their text with the standard's code: these are scored and ranked with
    the standard's written resources as their own, and have no separate "through" score."""
    with (CONFIG / "written_standards.csv").open(encoding="utf-8") as f:
        return {r["code"] for r in csv.DictReader(f) if (r.get("shares_written_form") or "").strip() == "yes"}


def inherited(cfg: dict) -> set[str]:
    """Indicators a spoken variety takes from its written standard: writing, written data, and every
    service and measure of the written-language technologies."""
    spec = cfg.get("written_standard", {})
    inds = set(spec.get("data", []))
    for t in spec.get("technologies", []):
        tech = cfg["dimensions"]["tech"]["technologies"][t]
        inds |= set(tech.get("consumer", [])) | set(tech.get("regional", [])) | set(tech.get("open", [])) \
            | set(tech.get("measured", {})) \
            | set(tech.get("depth", {})) | {q["indicator"] for q in tech.get("quality", {}).values()} \
            | ({tech["indicator"]} if "indicator" in tech else set())
    return inds


def inherit_written(by_lang: dict[str, dict[str, Record]], names: dict[str, str], cfg: dict) -> None:
    """Give each spoken variety its written standard's value for the written-language indicators,
    where that is higher than its own, with a note saying so."""
    inds = inherited(cfg)
    for code, std in written_standards().items():
        if code not in names or std not in by_lang:
            continue
        own = by_lang.setdefault(code, {})
        for ind in sorted(inds):  # sorted, so the output is the same on every run
            f = by_lang[std].get(ind)
            if f and f.value and (ind not in own or own[ind].value < f.value):
                note = f"Counted from {names[std]}" + (f". {f.note}" if f.note else "")
                own[ind] = dataclasses.replace(f, language=code, note=note)
                for spec in cfg["dimensions"]["data"]["indicators"].values():
                    narrow = spec.get("narrowed_by")
                    if narrow and spec is cfg["dimensions"]["data"]["indicators"].get(ind):
                        # the narrowing share goes with the count it describes
                        if narrow in by_lang[std]:
                            own[narrow] = dataclasses.replace(by_lang[std][narrow], language=code)
                        else:
                            own.pop(narrow, None)


def tier_of(ltdi: float, facts: dict[str, Record], dims: dict, cfg: dict) -> str:
    """Tier key ([tiers] in the methodology): score cut-offs for the top tiers; below them, stages by
    what's recorded for the language: a commercial or regional service, open tools only, data only,
    or nothing."""
    t = cfg["tiers"]
    for key, _, cut in t["cutoffs"]:
        if ltdi >= cut:
            return key
    techs = cfg["dimensions"]["tech"]["technologies"].values()
    if any(_on(facts.get(i)) and facts[i].unit == "bool" for x in techs for i in x.get("consumer", []) + x.get("regional", [])):
        return "lc"
    if any(_on(facts.get(i)) and facts[i].unit == "bool" for x in techs for i in x.get("open", [])):
        return "lo"
    if dims["data"].get("raw", dims["data"]["score"]) > 0:
        return "ld"
    return "ln"


def rank_key(r: dict) -> tuple[float, float]:
    """What a language is ranked by: its LTDI, then, among languages the floor puts level, the mean of
    its unfloored dimension scores, so any language with something recorded ranks above every language
    with nothing."""
    raw = [d.get("raw", d["score"]) for d in r.get("dimensions", {}).values()]
    return round(r["ltdi"], 9), round(sum(raw) / len(raw), 9) if raw else 0.0


def assign_ranks(results: list[dict]) -> None:
    """Competition ranks over living languages: equal keys (rank_key) share a rank (1, 2, 2, 4), and
    "tied" is how many others share it; within a tie the order is by name. Extinct languages are outside
    the ranking (rank None). Sorts results in place."""
    results.sort(key=lambda r: (*(-v for v in rank_key(r)), r["name"].lower(), r["code"]))
    ranked = [r for r in results if not r.get("extinct")]
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in ranked:
        groups[rank_key(r)].append(r)
    position = 1
    for key in sorted(groups, reverse=True):
        for r in groups[key]:
            r["rank"], r["tied"] = position, len(groups[key]) - 1
        position += len(groups[key])
    for r in results:
        r.setdefault("rank", None)  # extinct: outside the ranking
        r.setdefault("tied", 0)


def main() -> None:
    cfg = load_config()
    langs = json.loads((DATA / "languages.json").read_text(encoding="utf-8"))
    codes = [l["code"] for l in langs]
    records = read_dir(DATA / "records", codes) + read_dir(DATA / "manual", codes)
    by_lang: dict[str, dict[str, Record]] = defaultdict(dict)
    for r in records:
        by_lang[r.language][r.indicator] = r
    # A spoken variety is scored and ranked on its own records; "via" is what its speakers can use through
    # the standard they write (Kölsch through German), shown beside it on its page
    effective = defaultdict(dict, {c: dict(f) for c, f in by_lang.items()})
    inherit_written(effective, {l["code"]: l["name"] for l in langs}, cfg)
    data_inds = set(cfg["dimensions"]["data"]["indicators"]) | {
        s["narrowed_by"] for s in cfg["dimensions"]["data"]["indicators"].values() if s.get("narrowed_by")}

    countries: dict[str, dict[str, float]] = defaultdict(dict)
    if (DATA / "countries.csv").exists():
        with (DATA / "countries.csv").open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                countries[row["country"]][row["indicator"]] = float(row["value"])
    results = []
    written, shared = written_standards(), shares_written_form()
    for code in shared:  # its written form is the standard's, so the standard's written resources are its own
        if code in effective:
            by_lang[code] = effective[code]
    via_facts: dict[str, dict[str, Record]] = {}
    for lang in langs:
        code = lang["code"]
        facts_l = by_lang.get(code, {})
        s = score_language(facts_l, cfg)
        eff = effective.get(code, {})
        inherited_here = {i: f for i, f in eff.items() if facts_l.get(i) is not f}
        via = None
        if inherited_here:
            via_facts[code] = inherited_here
            sv = score_language(eff, cfg)
            via = {"ltdi": sv["ltdi"], "dimensions": sv["dimensions"], "tier": tier_of(sv["ltdi"], eff, sv["dimensions"], cfg)}
        # Opportunities: technology gaps as speakers meet them (through the standard where they write one),
        # data gaps and starter kits from the language's own records only
        opp_facts = {i: f for i, f in eff.items() if i not in data_inds} | {i: f for i, f in facts_l.items() if i in data_inds}
        # An extinct language keeps its page and scores but has no speakers to reach, so no opportunities
        opps = [] if lang.get("extinct") else rank(lang, find(opp_facts), s, opp_facts)
        for o in opps:
            o["id"] = f"{code}-{o['key']}"
            o["kit"] = starter_kit(o, facts_l)
            o["why"] = explain(lang, o, opp_facts)
        results.append({**lang, **s, "tier": tier_of(s["ltdi"], facts_l, s["dimensions"], cfg),
                        **({"via": via} if via else {}), **coverage(facts_l, cfg), "opportunities": opps,
                        "written_in": written.get(code), "shares_written": code in shared,
                        "reach_by_country": reach_by_country(lang, countries)})
    assign_ranks(results)
    big = max((r for r in results if r["rank"]), key=lambda r: r["tied"], default=None)
    if big:
        print(f"largest tie: {big['tied'] + 1} languages share rank {big['rank']} (LTDI {big['ltdi']}, tier {big['tier']})")

    def dump(inds: dict[str, Record]) -> dict:
        return {i: {k: getattr(r, k) for k in ("value", "unit", "source", "url", "retrieved", "method", "note")}
                for i, r in inds.items()}
    facts = {code: dump(inds) for code, inds in by_lang.items()}
    via = {code: dump(inds) for code, inds in via_facts.items()}  # a variety's values through its standard
    labels = {
        **{i: s["label"] for d in cfg["dimensions"].values() for i, s in d.get("indicators", {}).items()},
        **{k: v["label"] for k, v in cfg["dimensions"]["tech"]["technologies"].items()},
        **{k: d["label"] for k, d in cfg["dimensions"].items()},
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
    svc = [{k: sv[k] for k in ("id", "technology", "role", "name", "kind", "provider", "depth", "quality", "quality_poor",
                               "quality_good")} for sv in services()]
    rules = {k: {"teams": r["teams"], "missing": r["missing"], "cost": r.get("cost")} for k, r in RULES.items()}
    out = {"edition": cfg["meta"]["edition"], "labels": labels, "config": cfg, "services": svc, "rules": rules,
           "resources": resources(), "opportunity_types": TYPES, "teams": TEAMS, "history": history,
           "languages": results, "facts": facts, "via_facts": via}
    (DATA / "scores.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    write_edition(results, cfg)
    for r in results:
        d = r["dimensions"]
        print(f"{r['rank'] or '-':>4} {r['code']:<4} {r['name']:<18} LTDI {r['ltdi']:.3f}  "
              f"D {d['data']['score']:.2f}  T {d['tech']['score']:.2f}  {r['tier']}")


if __name__ == "__main__":
    main()
