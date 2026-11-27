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

import csv
import hashlib
import json
import math
import re
import shutil
from collections import Counter, defaultdict
from html import escape as html_escape

from . import CONFIG, DATA, ROOT

SITE = ROOT / "site"
EMBED_LIMIT = 3_000_000  # bytes of per-language data to embed in the page
SHARD_SIZE = 150  # languages per detail file


SUMMARY = ("code", "name", "autonym", "iso_639_3", "speakers", "region", "ltdi", "rank", "tied", "tier", "gaps", "endangerment")
PROFILE = ("glottocode", "script_names", "script_source", "endangerment_source", "note", "source", "written_in", "shares_written", "joshi", "ud", "census")  # shown only on the language's own page
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
        if not c:  # a country LinguaMeta doesn't list it in: spoken there by immigrant or diaspora communities
            c = {"code": r["country"], "name": names.get(r["country"]) or _country_name(r["country"]), "census_only": True}
            l["countries"].append(c)
        c["speakers"] = n
        l.setdefault("census", []).append([c["name"], r["source"], r["url"], n])
        touched.add(l["code"])
    for code in touched:  # most speakers first, as LinguaMeta's lists are
        by[code]["countries"].sort(key=lambda c: -(c.get("speakers") or 0))
        by[code]["census"] = [c[:3] for c in sorted(by[code]["census"], key=lambda c: -c[3])]


def udhr_samples() -> dict[str, list[str]]:
    """{language: [text, BCP 47 tag, direction, the text's name, its file, script, the script's name]}: Article 1
    of the Universal Declaration of Human Rights (data/udhr_article1.csv, ltdi.collectors.udhr), shown on its page."""
    from .backbone import script_names
    path = DATA / "udhr_article1.csv"
    if not path.exists():
        return {}
    names = {k.lower(): v for k, v in script_names().items()}
    return {r["language"]: [r["text"], r["bcp47"], r["dir"], r["name"], r["f"], r["script"],
                            names.get(r["script"].lower(), r["script"])]
            for r in csv.DictReader(path.open(encoding="utf-8"))}


def lingualibre_clips() -> dict[str, dict]:
    """{language: {"speaker", "clips": [[word, English gloss, MP3 URL, Commons file], ...]}}: a few words
    spoken by one speaker, from Lingua Libre (data/lingualibre.csv, ltdi.collectors.lingualibre)."""
    path = DATA / "lingualibre.csv"
    out: dict[str, dict] = {}
    if not path.exists():
        return out
    for r in csv.DictReader(path.open(encoding="utf-8")):
        if r["mp3"]:
            h = out.setdefault(r["language"], {"speaker": r["speaker"], "clips": []})
            h["clips"].append([r["transcription"], r["gloss"], r["mp3"], r["file"]])
    return out


def coverage(scores: dict) -> dict:
    """How many of the ranked languages each source covers, for the About page: a value missing from
    a language's page usually means its source doesn't cover the language.

    {"n": ranked languages, "meta": [[label, count], ...], "data": [[label, count], ...],
     "tech": [[technology label, any service, [[service, provider, role, count, entries], ...]], ...]}
    entries: how many entries the service's own list has, where known (data/list_entries.json), since a
    list often has several for one language (English (India), English (UK)), so it's 0 where unknown"""
    from collections import Counter
    ranked = [l for l in scores["languages"] if not l.get("extinct")]
    codes = {l["code"] for l in ranked}
    facts = scores["facts"]

    def has(f: dict) -> bool:
        v = f.get("value")
        if v is None or isinstance(v, str):
            return bool(v)
        return v < 100 if f.get("unit") == "% WER" else v > 0

    count = Counter(ind for c in codes for ind, f in facts.get(c, {}).items() if has(f))
    dims = scores["config"]["dimensions"]
    svc = {x["id"]: x for x in scores["services"]}
    tech = []
    entries = json.loads((DATA / "list_entries.json").read_text(encoding="utf-8")) if (DATA / "list_entries.json").exists() else {}
    for t in dims["tech"]["technologies"].values():
        if "indicator" in t:  # locale data: CLDR's coverage, no services
            tech.append([t["label"], count[t["indicator"]], [["Unicode CLDR", "", "quality", count[t["indicator"]], 0]]])
            continue
        ids = [*t.get("consumer", []), *t.get("open", []), *(t.get("regional") or [])]
        rows = [[svc[i]["name"], svc[i]["provider"], "regional" if i in (t.get("regional") or []) else svc[i]["role"], count[i],
                 entries.get(i, 0)] for i in ids if i in svc]
        rows += [[svc[i]["name"] if i in svc else i, svc.get(i, {}).get("provider", ""), "quality", count[i], 0]
                 for i in (t.get("measured") or {})]
        anyc = sum(1 for c in codes if any(has(facts.get(c, {}).get(i, {})) for i in ids))
        tech.append([t["label"], anyc, sorted(rows, key=lambda r: -r[3])])

    def rows_of(path: str) -> int:
        p = DATA / path
        return sum(1 for _ in csv.DictReader(p.open(encoding="utf-8"))) if p.exists() else 0
    geo_points = set()
    if (DATA / "world_languages.json").exists():
        geo_points = {p[0] for p in json.loads((DATA / "world_languages.json").read_text(encoding="utf-8"))}
    areas = json.loads((DATA / "areas.json").read_text(encoding="utf-8"))["paths"] if (DATA / "areas.json").exists() else {}
    census = {r["language"] for r in csv.DictReader((DATA / "census_languages.csv").open(encoding="utf-8"))} \
        if (DATA / "census_languages.csv").exists() else set()
    lingualibre = {r["language"] for r in csv.DictReader((DATA / "lingualibre.csv").open(encoding="utf-8"))} \
        if (DATA / "lingualibre.csv").exists() else set()
    meta = [
        ["Speaker count (LinguaMeta; Wikipedia where it has none)", sum(1 for l in ranked if l.get("speakers"))],
        ["Script (LinguaMeta; QQ where it has none)", sum(1 for l in ranked if l.get("script_names"))],
        ["Script encoded in Unicode (reported, not scored)", count["script_encoded"]],
        ["Endangerment level (LinguaMeta; Glottolog where it has none)", sum(1 for l in ranked if l.get("endangerment"))],
        ["Location on the map (LinguaMeta)", len(codes & geo_points)],
        ["Area on the map (Glottography)", len(codes & set(areas))],
        ["Speakers in another country from its census (UN Statistics Division, US Census Bureau)", len(codes & census)],
        ["Writing sample: Article 1 of the UDHR (UDHR in XML)", rows_of("udhr_article1.csv")],
        ["Spoken words (Lingua Libre)", len(codes & lingualibre)],
    ]
    return {"n": len(codes), "meta": meta,
            "data": [[i["label"], count[k]] for k, i in dims["data"]["indicators"].items()],
            "tech": tech}


def census_countries() -> list[str]:
    """Countries with census figures on language (data/census_languages.csv); the page notes the others."""
    path = DATA / "census_languages.csv"
    return sorted({r["country"] for r in csv.DictReader(path.open(encoding="utf-8"))}) if path.exists() else []


def _country_name(code: str) -> str:
    try:
        import pycountry
    except ImportError:
        return code.upper()
    c = pycountry.countries.get(alpha_2=code.upper())
    return getattr(c, "common_name", None) or (c.name if c else code.upper())


def opp_item(o: dict) -> dict:
    """An opportunity as the Opportunities page lists it, with b (gap x need x weight), u (users: all
    speakers, now, in five years) and m (momentum): the page works out its priorities from them, and
    ranks it by reach in chosen countries the same way."""
    return {k: o[k] for k in ("key", "short", "fact", "size")} | {
        "b": round(o["gap"] * o["need"] * o["weight"], 4),
        "u": [o["users"]["speakers"], o["users"]["now"], o["users"]["5y"]], "m": o["momentum"]}


def country_opportunities(scores: dict) -> dict:
    """{"by_country": {country: [[language, speakers there], ...]}}: with countries chosen, the page
    ranks every opportunity of the languages spoken there by reach there, its potential users scaled to
    the language's speakers in those countries (LinguaMeta's per-country figures)."""
    by_country: dict[str, list] = {}
    for l in scores["languages"]:
        sp = l.get("speakers") or 0
        if not sp or l.get("extinct") or not l["opportunities"]:
            continue
        cs = [(c["code"], c.get("speakers")) for c in l["countries"] if c["code"] not in NOT_PLACES]
        if len(cs) == 1 and not cs[0][1]:
            cs = [(cs[0][0], sp)]  # one country, no breakdown: all its speakers are there
        for c, n in cs:
            if n:
                by_country.setdefault(c, []).append([l["code"], n])
    return {"by_country": dict(sorted(by_country.items()))}


def country_online() -> dict[str, float]:
    """{country: latest share of people using the internet} (data/countries.csv, World Bank), so the
    page can count speakers online in the countries a filter chooses, as the connectivity collector
    does for each language."""
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


def split(scores: dict, eng: dict, families: tuple[dict, set],
          gnames: dict[str, str]) -> tuple[dict, dict[str, dict]]:
    """eng: engineering flags (ltdi.engineering), families: Glottolog groups above each language
    (ltdi.families), gnames: Glottolog's names, all computed once in main and shared with the API."""
    """Index for the whole site, and detail per language. Facts keep their source as an index into
    a shared table; opportunities drop what their rule or the resource catalogue already says."""
    sources: dict[tuple, int] = {}
    units: dict[str, str] = {}
    svc_index = {sv["id"]: i for i, sv in enumerate(scores["services"])}
    techs = list(scores["config"]["dimensions"]["tech"]["technologies"])
    langs, details, top = [], {}, []
    rr = {}
    if (DATA / "sensitivity.csv").exists():
        for r in csv.DictReader((DATA / "sensitivity.csv").open(encoding="utf-8")):
            rr[r["code"]] = [int(r["rank_p5"]), int(r["rank_p95"])]
    fam, isolates = families
    from .demand import language_literacy, official
    off, lit = official(), language_literacy()  # CLDR: official status and literacy by country (ltdi.demand)
    node_id: dict[str, int] = {}
    for p in fam.values():
        for g in p:
            node_id.setdefault(g, len(node_id))
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
    def encode(code: str, inds: dict) -> dict:
        out = {}
        for ind, f in inds.items():
            url = re.sub(rf"(?<=[=:&/#]){re.escape(code)}(?=$|[/&#?.])", "{lang}", f["url"])
            key = (f["source"], url, f["retrieved"], f["method"])
            out[ind] = [f["value"], sources.setdefault(key, len(sources))] + ([f["note"]] if f["note"] else [])
            units[ind] = f["unit"]
        return out

    # speech services that list a country locale for a variety without naming it (tools/unnamed_locales.py)
    unnamed: dict[str, dict[str, str]] = defaultdict(dict)
    if (DATA / "unnamed_locales.csv").exists():
        with (DATA / "unnamed_locales.csv").open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                unnamed[r["language"]][r["indicator"]] = r["counted_as"]
    # speech datasets shared under a data licence or for a fee, not counted as open (collectors/mdc.py)
    # and corpora from other distributors (config/licensed_speech.csv; ltdi/licensed.py)
    from .licensed import FIELDS, rows as licensed_rows
    licensed: dict[str, list] = defaultdict(list)
    for r in licensed_rows():
        licensed[r["language"]].append([r[k] for k in FIELDS])
    for l in scores["languages"]:
        facts = encode(l["code"], scores["facts"].get(l["code"], {}))
        opps = []
        for o in l["opportunities"]:
            top.append(opp_item(o) | {"lang": l["code"], "_p": o["priority_5y"]})
            o = {k: v for k, v in o.items() if k not in ("teams", "missing", "starter", "id", *hoisted[o["key"]])}
            o["kit"] = [[k["indicator"], k["size"]] for k in o["kit"]]
            opps.append(o)
        via = l.get("via")
        details[l["code"]] = {"dimensions": l["dimensions"], "facts": facts, "opportunities": opps,
                              # a spoken variety's values through the standard it writes, beside its own
                              **({"via": {"dimensions": via["dimensions"],
                                          "facts": encode(l["code"], scores.get("via_facts", {}).get(l["code"], {}))}}
                                 if via else {}),
                              **({"unnamed": unnamed[l["code"]]} if l["code"] in unnamed else {}),
                              **({"licensed": licensed[l["code"]]} if l["code"] in licensed else {}),
                              "reach_by_country": l["reach_by_country"], "evidence": l.get("evidence"),
                              # where it's mainly spoken: not the countries only a census adds (immigrant and
                              # diaspora communities), unless those are all there are
                              "countries": [c["name"] for c in l["countries"] if c["code"] not in NOT_PLACES
                                            and (not c.get("census_only") or all(x.get("census_only") for x in l["countries"]))],
                              **({"lookalikes": eng[l["code"]]["lookalikes"]} if "lookalikes" in eng.get(l["code"], {}) else {}),
                              **({"literacy": lit[l["code"]]} if l["code"] in lit else {}),
                              **{k: l.get(k) for k in PROFILE}}
        langs.append({k: l.get(k) for k in SUMMARY} | {
            "scores": {k: d["score"] for k, d in l["dimensions"].items()},
            # unfloored dimension scores, shown where the floor lifts a dimension (and used for the rank)
            "raw": {k: d["raw"] for k, d in l["dimensions"].items() if d["raw"] < d["score"]} or None,
            **({"via": [l["via"]["ltdi"], l["via"]["tier"]]} if l.get("via") else {}),
            # where the rank falls in 90% of re-scorings with other reasonable choices (ltdi.sensitivity)
            **({"rr": rr[l["code"]]} if l["code"] in rr else {}),
            "levels": "".join(l["levels"][t][0] for t in techs),  # f(ull) p(art) o(pen) n(one), in config order
            # why each technology is underrepresented: a(vailability), d(ata), q(uality), or w(ell served)
            "under": "".join((l.get("under") or {}).get(t, "a" if l["levels"][t] != "full" else "w") for t in techs),
            "offers": [svc_index[i] for i in l["offers"]],
            "opportunity_count": len(opps),
            "alt": "|".join(l.get("alt_names") or []),  # other names, for search
            # its countries, with LinguaMeta's speakers in each where known ("us:319000000 gb:64000000 jm"),
            # for the country and region filters and the speakers counted in them
            "cc": " ".join(c["code"] + (f":{c['speakers']}" if c.get("speakers") else "")
                           for c in l["countries"] if c["code"] not in NOT_PLACES),
            # of those, the ones only a census adds (immigrant and diaspora communities), which the planner's
            # country codes leave out
            **({"im": im} if (im := " ".join(c["code"] for c in l["countries"] if c.get("census_only"))) else {}),
            # its scripts (ISO 15924), main one first, and the countries that use others ("tw=Hant rs=Cyrl,Latn"),
            # for locale codes in the planner
            **({"sc": " ".join(x.title() for x in l["scripts"])} if l.get("scripts") else {}),
            **({"csc": cs} if (cs := " ".join(f"{c['code']}={','.join(x.title() for x in c['scripts'])}" for c in l["countries"]
                                              if c.get("scripts") and c["scripts"] != l["scripts"][:1] and c["code"] not in NOT_PLACES)) else {}),
            # engineering flags, one letter each (FLAG_LETTER)
            **({"fx": "".join(FLAG_LETTER[f] for f in eng[l["code"]]["flags"])} if l["code"] in eng else {}),
            # countries where it's official (CLDR): "ng", or "in:r" (regionally), "us:d" (in practice)
            **({"of": " ".join(c + ("" if st == "o" else ":" + st) for c, st in sorted(off[l["code"]].items()))}
               if l["code"] in off else {}),
            # its family and the groups below it, as indexes into "gnodes" (base 36); "giso" for isolates
            **({"gp": " ".join(_b36(node_id[g]) for g in fam[l["code"]])} if l["code"] in fam else {}),
            **({"giso": 1} if l["code"] in isolates else {}),
            # every region it's spoken in (its home region and its countries'), for the region filter
            "rg": "".join(sorted({REGION_CODE[r] for r in [l.get("region"), *(country_region.get(c["code"]) for c in l["countries"])]
                                  if r in REGION_CODE})),
            **({"extinct": 1} if l.get("extinct") else {}),
            "online": round(l["speakers"] * reach["value"]) if l.get("speakers") and (
                reach := scores["facts"].get(l["code"], {}).get("reach_voice_share")) else None,
            **planner_fields(l, scores["facts"].get(l["code"], {}), scores["resources"]),
        })
    top.sort(key=lambda o: (-o["_p"], o["lang"], o["key"]))
    for o in top:
        del o["_p"]
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
    from .demand import country_literacy
    index["country_literacy"] = country_literacy()
    index["gnodes"] = [[g, gnames.get(g, g)] for g in sorted(node_id, key=node_id.get)]
    from .engineering import FLAGS
    index["flags"] = {FLAG_LETTER[k]: [k, v] for k, v in FLAGS.items()}
    index["speech_kind"] = {i: SPEECH_KINDS.index(k) for i, k in SPEECH_KIND.items()}
    index |= {"history": hist, "languages": langs, "top_opportunities": top, "country_names": country_names,
              "units": units,
              "fact_defaults": {ind: json.loads(f) for ind, f in defaults.items()},
              "sources": [list(k) for k in sorted(sources, key=sources.get)]}
    return index, details


def compact(index: dict) -> None:
    """Shorter forms for the per-language fields every language carries, decoded once when the page
    loads (the loop that prepares ALL in site/src/js/core.js), so the page's code sees the usual fields:

      gaps {"llm": "open", ...}           -> "gx": one character per technology in GAP_ORDER:
                                             n (nothing), o (open tools only), - (no gap)
      scores {"data": .61, "tech": .56}   -> "s": [.61, .56] in DIM_ORDER
      raw {"data": 0.0}                   -> "rw": [0.0, null] in DIM_ORDER
      endangerment "not_endangered"       -> "en": index into ENDANGERMENT
      opportunity_count 11                -> "oc": 11"""
    techs = list(index["config"]["dimensions"]["tech"]["technologies"])
    dims = list(index["config"]["dimensions"])
    levels = sorted({l.get("endangerment") for l in index["languages"] if l.get("endangerment")})
    index |= {"gap_order": techs, "dim_order": dims, "endangerment_levels": levels}
    code = {"none": "n", "open": "o"}
    for l in index["languages"]:
        gaps = l.pop("gaps", None) or {}
        if gaps:
            l["gx"] = "".join(code.get(gaps.get(t), "-") for t in techs)
        sc = l.pop("scores")
        l["s"] = [sc.get(k) for k in dims]
        if (raw := l.pop("raw", None)):
            l["rw"] = [raw.get(k) for k in dims]
        if (e := l.pop("endangerment", None)):
            l["en"] = levels.index(e)
        l["oc"] = l.pop("opportunity_count", 0)


def what_label(scores: dict):
    """Names what each organisations.csv id stands for, as the API lists it."""
    svc = {s["id"]: s for s in scores["services"]}
    techs = scores["config"]["dimensions"]["tech"]["technologies"]
    res = {r["indicator"]: r["name"] for r in csv.DictReader((CONFIG / "resources.csv").open(encoding="utf-8"))}
    bench = {"bench_global_mmlu": "Global-MMLU", "bench_mmmlu": "MMMLU", "bench_include": "INCLUDE", "bench_xnli": "XNLI",
             "bench_mgsm": "MGSM", "bench_irokobench": "IrokoBench", "llm_afrobench_gpt4o": "AfroBench results",
             "llm_afrobench_gemini": "AfroBench results", "ud_treebank_words": "Universal Dependencies treebank",
             "wikipedia_articles": "Wikipedia"}

    def label(i: str) -> str:
        if i in bench:
            return bench[i]
        if i in res:
            return res[i]
        s = svc.get(i)
        if s and s["role"] == "regional":
            return techs[s["technology"]]["label"]
        return s["name"] if s else i
    return label


def _b36(n: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while True:
        n, r = divmod(n, 36)
        out = digits[r] + out
        if not n:
            return out


FLAG_LETTER = {"rtl": "r", "shaping": "s", "nospace": "w", "ime": "i", "scripts": "m", "lookalike": "l"}
PLAN_QUALITY = ("asr_whisper_fleurs_wer", "mt_nllb_flores_chrf", "mt_google_flores_chrf")
# Ingredients the readiness checklists need that aren't services (services come from "offers"), one letter each
READY_FLAGS = {"f": ("speech_fleurs", 0), "c": ("cv_validated_hours", 0), "F": ("flores200", 0), "b": ("eval_benchmarks", 0),
               "u": ("script_encoded", 0), "l": ("cldr_coverage", 0), "n": ("font_noto", 0), "d": ("ud_treebank_words", 0),
               "w": ("wordlist_corpuscrawler", 0)}


# What kind of speech each open dataset holds, for the Plan tab: read aloud; spontaneous (people speaking in
# their own words: answers, descriptions, conversation); broadcast and video (radio, YouTube with its
# uploaders' subtitles); and benchmarks, small sets built for measuring models, kept apart since a test set
# should stay out of training.
SPEECH_KINDS = ("read", "spontaneous", "broadcast", "benchmark")
SPEECH_KIND = {
    "cv_validated_hours": "read", "speech_kathbath": "read", "speech_naijavoices": "read",
    "speech_multilingual_librispeech": "read",
    "cv_spontaneous_hours": "spontaneous", "speech_waxal": "spontaneous", "speech_indicvoices": "spontaneous",
    "speech_vaani": "spontaneous", "speech_spring_inx": "spontaneous", "speech_mdc_spontaneous": "spontaneous", "speech_mdc_spontaneous_nc": "spontaneous",
    "speech_mdc": "read", "speech_mdc_nc": "read",
    "speech_swivuriso_african_next_voices": "spontaneous", "speech_afrivoices_ke_african_next_voices": "spontaneous",
    "speech_afrivoices_ke_scripted": "read", "speech_african_next_voices_bambara": "spontaneous",
    "speech_omnilingual_asr_corpus": "spontaneous", "speech_waxal_tts": "read",
    "speech_bloom_library": "read", "speech_bloom_library_non_commercial": "read",
    "speech_openslr_read_speech": "read", "speech_openslr_read_speech_non_commercial": "read",
    "speech_openslr_broadcast": "broadcast", "speech_openslr_spontaneous": "spontaneous",
    "speech_openslr_spontaneous_non_commercial": "spontaneous", "speech_nchlt_speech": "read",
    "speech_wazobiaspeech_african_voices_nigeria": "spontaneous", "speech_wazobiaspeech_scripted_african_voices_nigeria": "read",
    "speech_afrivoice_digital_umuganda": "spontaneous", "speech_afrivoice_scripted_digital_umuganda": "read",
    "speech_shrutilipi": "broadcast", "speech_yodas": "broadcast", "speech_voxpopuli": "broadcast",
    "speech_fleurs": "benchmark",
}


def speech_by_kind(facts: dict, resources: dict, commercial: bool = False) -> list[float]:
    """Open transcribed hours by kind (SPEECH_KINDS order); commercial: only datasets whose licence
    permits commercial use."""
    out = [0.0] * len(SPEECH_KINDS)
    for i, f in facts.items():
        if i.startswith("speech_") or i in ("cv_validated_hours", "cv_spontaneous_hours"):
            if i not in SPEECH_KIND:
                raise KeyError(f"{i}: add its kind of speech to SPEECH_KIND in build_site.py")
            if not commercial or resources.get(i, {}).get("commercial") == "yes":
                out[SPEECH_KINDS.index(SPEECH_KIND[i])] += f["value"] or 0
    return [round(h, 1) for h in out]


def usable_hours(facts: dict, resources: dict) -> float:
    """Open transcribed speech whose licence permits commercial use (resources.csv: commercial = yes)."""
    return math.fsum(f["value"] for i, f in facts.items()  # fsum: the same result on every Python version
                     if (i.startswith("speech_") or i in ("cv_validated_hours", "cv_spontaneous_hours"))
                     and resources.get(i, {}).get("commercial") == "yes")


def planner_fields(l: dict, facts: dict, resources: dict) -> dict:
    """What the Plan tab needs for each language, compactly: people online in five years (voice) and
    able to text now and in five years; open speech hours, all and commercially usable; web text and
    parallel sentences; the open models' published quality; and, for a spoken variety, the standard
    its speakers write ("wi")."""
    v = lambda i: facts[i]["value"] if i in facts else None
    sp, g = l.get("speakers") or 0, v("speaker_growth_5y") or 1.0
    out = {}
    if sp and v("reach_voice_share_5y") is not None:
        out["o5"] = round(sp * g * v("reach_voice_share_5y"))
    if v("reach_voice_share_5y") is not None:
        out["o5s"] = round(v("reach_voice_share_5y"), 3)  # the share of its speakers that is, for the Plan table
    if v("reach_text_share_5y") is not None:
        out["ot5s"] = round(v("reach_text_share_5y"), 3)
    if sp and v("reach_text_share") is not None:
        out["ot"] = round(sp * v("reach_text_share"))
    if sp and v("reach_text_share_5y") is not None:
        out["ot5"] = round(sp * g * v("reach_text_share_5y"))
    if v("open_speech_hours"):
        out["sh"] = round(v("open_speech_hours"), 1)
        out["shc"] = round(usable_hours(facts, resources), 1)
        out["sk"] = speech_by_kind(facts, resources)  # [read, spontaneous, broadcast, benchmark]
        if out["shc"] < out["sh"]:
            out["skc"] = speech_by_kind(facts, resources, commercial=True)
        # each dataset's hours, for the Plan table's hover text
        out["sd"] = {i: round(f["value"], 1) for i, f in facts.items() if i in SPEECH_KIND and (f["value"] or 0) >= 0.05}
    if v("web_text_words"):
        out["ww"] = round(v("web_text_words"))
    if v("parallel_sentences"):
        out["ps"] = round(v("parallel_sentences"))
    q = {i: v(i) for i in PLAN_QUALITY if v(i) is not None and not (i.endswith("_wer") and v(i) >= 100)}
    if q:
        out["qv"] = q
    if l.get("written_in") and not l.get("shares_written"):
        out["wi"] = l["written_in"]
    for key, i in (("wv", "wikipedia_pageviews"), ("hm", "hf_models"), ("hd", "hf_model_downloads")):
        if v(i):
            out[key] = round(v(i))
    rk = "".join(k for k, (i, above) in READY_FLAGS.items() if (v(i) or 0) > above)
    if rk:
        out["rk"] = rk
    return out


def static_summary(scores: dict) -> str:
    """What the page says before (or without) JavaScript: the top 20 and where to download the scores,
    for search engines, link previews and plain fetchers."""
    tiers = {k: t for k, t, *_ in scores["config"]["tiers"]["cutoffs"]} | {k: t for k, t, *_ in scores["config"]["tiers"]["stages"]}
    ranked = [l for l in scores["languages"] if l.get("rank")]
    rows = "".join(f"<tr><td>{l['rank']}</td><td>{html_escape(l['name'])}</td><td>{l['ltdi']:.3f}</td><td>{tiers.get(l['tier'], '')}</td></tr>"
                   for l in ranked[:20])
    ed = scores["edition"]
    return (f'<noscript><div class="static"><p>The Language Technology Development Index scores {len(ranked):,} living languages '
            f"on how well technology supports them and how much data exists to build more. This page needs JavaScript; "
            f'the scores are also a <a href="data/ltdi-{ed}.csv">CSV file</a> (edition {ed}, CC BY-SA 4.0), and the code and data '
            f'are on <a href="https://github.com/sandyfritchie/ltdi">GitHub</a>.</p>'
            f"<table><thead><tr><th>Rank</th><th>Language</th><th>LTDI</th><th>Tier</th></tr></thead><tbody>{rows}</tbody></table></div></noscript>")


def template() -> str:
    """The page's source, site/src/page.html, with each <!--#include path--> line replaced by that file
    from site/src (styles.css, and the app's script in sections under js/)."""
    src = SITE / "src"
    out = []
    for line in (src / "page.html").read_text(encoding="utf-8").split("\n"):
        m = re.fullmatch(r"<!--#include (\S+)-->", line)
        out.append((src / m.group(1)).read_text(encoding="utf-8").removesuffix("\n") if m else line)
    return "\n".join(out)


def main() -> None:
    scores = json.loads((DATA / "scores.json").read_text(encoding="utf-8"))
    add_census(scores)
    from .changes import all_events
    from .engineering import all_flags
    from .families import paths as family_paths
    from .glottolog import names as glottolog_names
    eng, families, gnames = all_flags(scores["languages"]), family_paths(scores["languages"]), glottolog_names()
    changes = all_events(scores["edition"], scores.get("history"))
    index, details = split(scores, eng, families, gnames)
    index["census_countries"] = census_countries()
    index["coverage"] = coverage(scores)
    # comparison with Joshi et al.'s classes and SIL's DLS levels (tools/validate.py)
    if (DATA / "sensitivity.json").exists():
        index["sensitivity"] = json.loads((DATA / "sensitivity.json").read_text(encoding="utf-8"))
    if (DATA / "validation.json").exists():
        index["validation"] = json.loads((DATA / "validation.json").read_text(encoding="utf-8"))
    for code, sample in udhr_samples().items():
        if code in details:
            details[code]["sample"] = sample
    for code, hear in lingualibre_clips().items():
        if code in details:
            details[code]["hear"] = hear
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

    # what changed, and when, as an Atom feed (ltdi.changes)
    from .changes import write_feed
    write_feed(SITE, changes, {l["code"]: l["name"] for l in scores["languages"]})
    (SITE / "data" / "changes.json").unlink(missing_ok=True)

    # one JSON file per language, with a schema, for other people's tools (ltdi.api)
    from .api import write_api
    n_api = write_api(SITE, scores, eng, families, gnames)

    # the edition's scores, for download (written by ltdi.score: data/editions/)
    edition = scores["edition"]
    for name in (f"{edition}.csv", f"{edition}.json", f"{edition}-services.csv"):
        src = DATA / "editions" / name
        if src.exists():
            shutil.copyfile(src, SITE / "data" / f"ltdi-{name}")

    src = template().replace("<!--__STATIC__-->", static_summary(scores))
    # the over-time history is only for the Charts page, so it's fetched when that opens
    (SITE / "data" / "history.json").write_text(_dump(index.pop("history", None)), encoding="utf-8")
    # likewise the top opportunities, for the Opportunities tab
    (SITE / "data" / "top_opportunities.json").write_text(_dump(index.pop("top_opportunities", [])), encoding="utf-8")
    # languages with neither an area nor a point on the map: their pages leave out the small map, so the
    # space it takes is known before the map's own file (data/map.json) arrives
    if (DATA / "world_languages.json").exists():
        on_map = {p[0] for p in json.loads((DATA / "world_languages.json").read_text(encoding="utf-8"))}
        if (DATA / "areas.json").exists():
            on_map |= set(json.loads((DATA / "areas.json").read_text(encoding="utf-8")).get("paths", {}))
        index["nomap"] = sorted(l["code"] for l in index["languages"] if l["code"] not in on_map)
    compact(index)
    page = src.replace("/*__DATA__*/", _dump(index).replace("</", "<\\/"))
    page = page.replace("/*__LANGS__*/", embed.replace("</", "<\\/"))
    if (DATA / "basemap.json").exists() and (DATA / "world_languages.json").exists():
        areas = (DATA / "areas.json").read_text(encoding="utf-8") if (DATA / "areas.json").exists() else "null"
        geo = '{"basemap":' + (DATA / "basemap.json").read_text(encoding="utf-8") + ',"points":' + \
              (DATA / "world_languages.json").read_text(encoding="utf-8") + ',"areas":' + areas + '}'
        page = page.replace("/*__MAP__*/", geo.replace("</", "<\\/"))
        geo_text = geo
    else:
        page = page.replace("/*__MAP__*/", "null")
        geo_text = "null"
    # The preview keeps everything inline. The public site splits it into cached files (app.css, app.js,
    # data/index.js) and small pages that load them: the home page here, a page per language at publish
    # time (ltdi.pages)
    (SITE / "artifact.html").write_text(page, encoding="utf-8")
    from .pages import write_app, write_language_pages
    # the map's outlines, areas and points are a third of the data and only the map and language pages draw
    # them, so the public site loads them on their own (data/map.json), after the first view is drawn
    (SITE / "data" / "map.json").write_text(geo_text, encoding="utf-8")
    map_url = f"/data/map.json?v={hashlib.sha256(geo_text.encode()).hexdigest()[:10]}"
    data_js = ("window.LTDI_DATA=" + _dump(index) + ";\nwindow.LTDI_MAP_URL=" + json.dumps(map_url) + ";\nwindow.LTDI_LANGS=" + embed + ";\n")
    html = write_app(page, data_js)
    write_language_pages()
    print(f"wrote site/index.html ({len(html.encode()) / 1e3:.0f} KB, data/index.js {len(data_js.encode()) / 1e6:.2f} MB, data/map.json {len(geo_text.encode()) / 1e6:.2f} MB; index {len(_dump(index).encode()) / 1e6:.2f} MB, "
          f"{len(details)} languages in {len(shards)} files, {total / 1e6:.2f} MB, {'embedded' if embed != 'null' else 'loaded on demand'})")


if __name__ == "__main__":
    main()
