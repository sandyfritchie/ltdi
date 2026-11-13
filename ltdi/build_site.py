"""Build the static site from data/scores.json.

Run:  python -m ltdi.build_site
Writes:
  site/index.html      the page, with the index embedded: every language's summary (scores,
                       coverage, gaps) plus the top opportunities, enough for the ranking, charts
                       and opportunity list
  site/data/lang/*.json  each language's detail (facts with sources, opportunities, reach by
                       country), in SHARDS files of neighbouring codes, loaded when a page opens
  site/artifact.html   the same page as an artifact body

When the per-language files are small in total (EMBED_LIMIT), they are also embedded in the page,
so it works opened straight from disk. Otherwise serve the site folder over HTTP
(python -m http.server -d site) or from GitHub Pages.
"""

from __future__ import annotations

import json
import re
import shutil
from collections import Counter

from . import DATA, ROOT

SITE = ROOT / "site"
EMBED_LIMIT = 3_000_000  # bytes of per-language data to embed in the page
SHARD_SIZE = 150  # languages per detail file
TOP_OPPORTUNITIES = 1000  # opportunities listed on the Opportunities page before choosing a language
COUNTRY_OPPORTUNITIES = 30  # each country's own top opportunities, ranked by reach there
PER_TYPE = 50            # of which at least this many of each kind of action, so every kind can be browsed


def top_listed(top: list[dict]) -> list[dict]:
    """The opportunities listed before a language is chosen: the highest-priority ones of each kind of
    action, then the highest-priority of the rest, up to TOP_OPPORTUNITIES, in priority order."""
    picked, per = set(), Counter()
    for i, o in enumerate(top):
        if per[o["_type"]] < PER_TYPE:
            picked.add(i)
            per[o["_type"]] += 1
    for i in range(len(top)):
        if len(picked) >= TOP_OPPORTUNITIES:
            break
        picked.add(i)
    return [{k: v for k, v in o.items() if k != "_type"} for i, o in enumerate(top) if i in picked]
SUMMARY = ("code", "name", "autonym", "iso_639_3", "speakers", "region", "ltdi", "rank", "gaps", "endangerment")
PROFILE = ("script_names", "script_source", "endangerment_source", "note", "source", "written_in", "joshi", "ud", "census")  # shown only on the language's own page
# Left out of a language's country list: places with no permanent population, and CLDR's
# pseudo-regions (LinguaMeta lists them without speaker counts)
# Region filter: one letter per region group, as the page reads them
REGION_CODE = {"Africa": "A", "South Asia": "S", "Rest of Asia": "R", "Europe": "E", "Americas": "M", "Oceania": "O"}
NOT_PLACES = {"aq", "bv", "gs", "hm", "tf", "um", "xa", "xb", "zz"}


def add_census(scores: dict) -> None:
    """Census counts (data/census_languages.csv, ltdi.collectors.census_languages) for languages
    LinguaMeta doesn't list in a country, or lists there without a count: Tagalog, Chinese or
    Vietnamese in the United States, say. For the site's country breakdowns only (filters, speakers
    in a country, each country's opportunities), so LinguaMeta's figures, world totals and scores stay
    as they are. Each language records the censuses it took figures from ("census": [[country,
    source, url], ...]), for its page."""
    import csv
    path = DATA / "census_languages.csv"
    if not path.exists():
        return
    by = {l["code"]: l for l in scores["languages"]}
    names = {c["code"]: c["name"] for l in scores["languages"] for c in l["countries"]}
    touched = set()
    for r in csv.DictReader(path.open(encoding="utf-8")):
        l = by.get(r["language"])
        if not l or l.get("extinct") or r["country"] in NOT_PLACES:
            continue
        n = int(r["speakers"])
        if l.get("speakers"):
            n = min(n, l["speakers"])  # never more in one country than LinguaMeta's world total
        c = next((c for c in l["countries"] if c["code"] == r["country"]), None)
        if c and c.get("speakers"):
            continue
        if not c:
            c = {"code": r["country"], "name": names.get(r["country"]) or _country_name(r["country"])}
            l["countries"].append(c)
        c["speakers"] = n
        l.setdefault("census", []).append([c["name"], r["source"], r["url"], n])
        touched.add(l["code"])
    for code in touched:  # most speakers first, as LinguaMeta's lists are
        by[code]["countries"].sort(key=lambda c: -(c.get("speakers") or 0))
        by[code]["census"] = [c[:3] for c in sorted(by[code]["census"], key=lambda c: -c[3])]


def _country_name(code: str) -> str:
    try:
        import pycountry
    except ImportError:
        return code.upper()
    c = pycountry.countries.get(alpha_2=code.upper())
    return getattr(c, "common_name", None) or (c.name if c else code.upper())


def country_opportunities(scores: dict) -> dict:
    """Each country's top opportunities, ranked by reach in that country: priority recomputed with the
    language's potential users scaled to its speakers there (LinguaMeta's per-country figures), so the
    US list is led by the languages most spoken in the US, not cut from the global top list.

    {"items": [opportunity, as in top_opportunities, plus b (gap x need / cost), u (users: all, now,
    in five years) and m (momentum)], "by_country": {country: [[item index, speakers there], ...]}};
    the page sums speakers over the countries chosen and recomputes the priorities from b, u and m."""
    import math

    def reach(n: float) -> float:
        return max(0.0, math.log10(max(n, 1)) - 4)  # as opportunities._reach

    cand: dict[str, list] = {}
    opp = {}
    for l in scores["languages"]:
        sp = l.get("speakers") or 0
        if not sp or l.get("extinct"):
            continue
        cs = [(c["code"], c.get("speakers")) for c in l["countries"] if c["code"] not in NOT_PLACES]
        if len(cs) == 1 and not cs[0][1]:
            cs = [(cs[0][0], sp)]  # one country, no breakdown: all its speakers are there
        for o in l["opportunities"]:
            opp[l["code"], o["key"]] = o
        for c, n in cs:
            if not n:
                continue
            frac = min(1.0, n / sp)
            for o in l["opportunities"]:
                base = o["gap"] * o["need"] / o["cost"]
                cand.setdefault(c, []).append((reach(o["users"]["5y"] * frac) * base * o["momentum"], l["code"], o["key"], n))
    items, index, by_country = [], {}, {}
    for c, xs in sorted(cand.items()):
        xs.sort(key=lambda x: (-x[0], x[1], x[2]))
        rows = []
        for _, lang, key, n in xs[:COUNTRY_OPPORTUNITIES]:
            if (lang, key) not in index:
                o = opp[lang, key]
                index[lang, key] = len(items)
                items.append({k: o[k] for k in ("key", "title", "why", "priority", "priority_now", "priority_5y")}
                             | {"lang": lang, "b": round(o["gap"] * o["need"] / o["cost"], 4),
                                "u": [o["users"]["speakers"], o["users"]["now"], o["users"]["5y"]], "m": o["momentum"]})
            rows.append([index[lang, key], n])
        by_country[c] = rows
    return {"items": items, "by_country": by_country}


def country_online() -> dict[str, float]:
    """{country: latest share of people using the internet} (data/countries.csv, World Bank), so the
    page can count speakers online in the countries a filter chooses, as the connectivity collector
    does for each language."""
    import csv
    path = DATA / "countries.csv"
    if not path.exists():
        return {}
    latest: dict[str, tuple[int, float]] = {}
    with path.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["indicator"] == "internet" and r["value"]:
                y = int(r["year"] or 0)
                if r["country"] not in latest or y > latest[r["country"]][0]:
                    latest[r["country"]] = (y, round(float(r["value"]) / 100, 3))
    return {c: v for c, (_, v) in latest.items()}


def _dump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def split(scores: dict) -> tuple[dict, dict[str, dict]]:
    """Index for the whole site, and detail per language. Facts keep their source as an index into
    a shared table; opportunities drop what their rule or the resource catalogue already says."""
    sources: dict[tuple, int] = {}
    units: dict[str, str] = {}
    svc_index = {sv["id"]: i for i, sv in enumerate(scores["services"])}
    techs = list(scores["config"]["dimensions"]["tech"]["technologies"])
    langs, details, top = [], {}, []
    from .backbone import _locales, region_group  # LinguaMeta's country -> region table (cached)
    country_region = {c: region_group(v["region"], v["subregion"]) for c, v in _locales().items() if v.get("region")}
    # Fields that are the same in every opportunity from a rule go to the rule, once
    rules = {k: dict(v) for k, v in scores["rules"].items()}
    by_rule: dict[str, list[dict]] = {}
    for l in scores["languages"]:
        for o in l["opportunities"]:
            by_rule.setdefault(o["key"], []).append(o)
    hoisted = {}
    for key, opps in by_rule.items():
        same = {f: v for f, v in opps[0].items()
                if f not in ("key", "id", "kit") and all(o.get(f) == v for o in opps)}
        rules.setdefault(key, {}).update(same)
        hoisted[key] = set(same)
    for l in scores["languages"]:
        facts = {}
        for ind, f in scores["facts"].get(l["code"], {}).items():
            url = re.sub(rf"(?<=[=:&/#]){re.escape(l['code'])}(?=$|[/&#?])", "{lang}", f["url"])
            key = (f["source"], url, f["retrieved"], f["method"])
            facts[ind] = [f["value"], sources.setdefault(key, len(sources))] + ([f["note"]] if f["note"] else [])
            units[ind] = f["unit"]
        opps = []
        for o in l["opportunities"]:
            top.append({k: o[k] for k in ("key", "title", "why", "priority", "priority_now", "priority_5y")}
                       | {"lang": l["code"], "_type": o["type"]})
            o = {k: v for k, v in o.items() if k not in ("teams", "missing", "starter", "id", *hoisted[o["key"]])}
            o["kit"] = [[k["indicator"], k["size"]] for k in o["kit"]]
            opps.append(o)
        details[l["code"]] = {"dimensions": l["dimensions"], "facts": facts, "opportunities": opps,
                              "reach_by_country": l["reach_by_country"],
                              "countries": [c["name"] for c in l["countries"] if c["code"] not in NOT_PLACES],
                              **{k: l.get(k) for k in PROFILE}}
        langs.append({k: l.get(k) for k in SUMMARY} | {
            "scores": {k: d["score"] for k, d in l["dimensions"].items()},
            "levels": "".join(l["levels"][t][0] for t in techs),  # f(ull) p(art) o(pen) n(one), in config order
            "offers": [svc_index[i] for i in l["offers"]],
            "opportunity_count": len(opps),
            "alt": "|".join(l.get("alt_names") or []),  # other names, for search
            # its countries, with LinguaMeta's speakers in each where known ("us:319000000 gb:64000000 jm"),
            # for the country and region filters and the speakers counted in them
            "cc": " ".join(c["code"] + (f":{c['speakers']}" if c.get("speakers") else "")
                           for c in l["countries"] if c["code"] not in NOT_PLACES),
            # every region it's spoken in (its home region and its countries'), for the region filter
            "rg": "".join(sorted({REGION_CODE[r] for r in [l.get("region"), *(country_region.get(c["code"]) for c in l["countries"])]
                                  if r in REGION_CODE})),
            **({"extinct": 1} if l.get("extinct") else {}),
            "online": round(l["speakers"] * reach["value"]) if l.get("speakers") and (
                reach := scores["facts"].get(l["code"], {}).get("reach_voice_share")) else None,
        })
    top.sort(key=lambda o: (-o["priority_5y"], o["lang"], o["key"]))
    listed = top_listed(top)
    # A fact most languages share (usually "not offered") is sent once; each language lists only its own
    # facts and the shared ones it lacks
    count: dict[str, Counter] = {}
    for d in details.values():
        for ind, f in d["facts"].items():
            count.setdefault(ind, Counter())[_dump(f)] += 1
    defaults = {}
    for ind, c in count.items():
        f, n = c.most_common(1)[0]
        if n > len(details) / 2:
            defaults[ind] = f
    for d in details.values():
        lacks = [ind for ind in defaults if ind not in d["facts"]]
        d["facts"] = {ind: f for ind, f in d["facts"].items() if _dump(f) != defaults.get(ind)}
        if lacks:
            d["lacks"] = lacks
    shard = {c: i // SHARD_SIZE for i, c in enumerate(sorted(details))}
    for l in langs:
        l["shard"] = shard[l["code"]]
    hist = scores.get("history")
    if hist:  # one string per language and series: 1, 0, or . (no data) for each period
        periods = hist["periods"]
        hist = {**hist, "values": {s: {c: "".join(".01"[v[p] + 1] if p in v else "." for p in periods)
                                       for c, v in by.items()} for s, by in hist["values"].items()}}
    index = {k: scores[k] for k in ("edition", "labels", "config", "services", "resources",
                                    "opportunity_types", "teams")} | {"rules": rules}
    country_names = {c["code"]: c["name"] for l in scores["languages"] for c in l["countries"] if c["code"] not in NOT_PLACES}
    index |= {"country_regions": {c: REGION_CODE[r] for c, r in country_region.items() if r in REGION_CODE},
              "country_online": country_online()}
    index |= {"history": hist, "languages": langs, "top_opportunities": listed, "country_names": country_names,
              "opportunity_total": len(top), "units": units,
              "fact_defaults": {ind: json.loads(f) for ind, f in defaults.items()},
              "sources": [list(k) for k in sorted(sources, key=sources.get)]}
    return index, details


def main() -> None:
    scores = json.loads((DATA / "scores.json").read_text(encoding="utf-8"))
    add_census(scores)
    index, details = split(scores)
    out = SITE / "data" / "lang"
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    shards: dict[int, dict] = {}
    for l in index["languages"]:
        shards.setdefault(l["shard"], {})[l["code"]] = details[l["code"]]
    total = 0
    for n, group in shards.items():
        text = _dump(group)
        total += len(text.encode())
        (out / f"{n}.json").write_text(text, encoding="utf-8")
    embed = _dump(details) if total <= EMBED_LIMIT else "null"
    # detailed borders and coasts, fetched when the map is first zoomed to chosen countries
    if (DATA / "borders.json").exists():
        shutil.copyfile(DATA / "borders.json", SITE / "data" / "borders.json")
    # each country's own top opportunities, fetched when the country filter is first used
    (SITE / "data" / "country_opportunities.json").write_text(_dump(country_opportunities(scores)), encoding="utf-8")

    template = (SITE / "template.html").read_text(encoding="utf-8")
    page = template.replace("/*__DATA__*/", _dump(index).replace("</", "<\\/"))
    page = page.replace("/*__LANGS__*/", embed.replace("</", "<\\/"))
    if (DATA / "basemap.json").exists() and (DATA / "world_languages.json").exists():
        areas = (DATA / "areas.json").read_text(encoding="utf-8") if (DATA / "areas.json").exists() else "null"
        geo = '{"basemap":' + (DATA / "basemap.json").read_text(encoding="utf-8") + ',"points":' + \
              (DATA / "world_languages.json").read_text(encoding="utf-8") + ',"areas":' + areas + '}'
        page = page.replace("/*__MAP__*/", geo.replace("</", "<\\/"))
    else:
        page = page.replace("/*__MAP__*/", "null")
    # The template is written as an artifact body; wrap it as a full document for standalone use.
    head, _, body = page.partition('<div class="wrap">')
    html = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + head + '</head>\n<body>\n<div class="wrap">' + body + "\n</body>\n</html>\n"
    )
    (SITE / "index.html").write_text(html, encoding="utf-8")
    (SITE / "artifact.html").write_text(page, encoding="utf-8")
    print(f"wrote site/index.html ({len(html.encode()) / 1e6:.2f} MB; index {len(_dump(index).encode()) / 1e6:.2f} MB, "
          f"{len(details)} languages in {len(shards)} files, {total / 1e6:.2f} MB, {'embedded' if embed != 'null' else 'loaded on demand'})")


if __name__ == "__main__":
    main()
