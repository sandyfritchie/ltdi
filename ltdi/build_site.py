"""Build the static site from data/scores.json.

Run:  python -m ltdi.build_site
Writes:
  site/index.html      the page, with the index embedded: every language's summary (scores,
                       coverage, gaps) plus the top opportunities, enough for the ranking, charts
                       and opportunity list
  site/data/lang/*.json  one file per language with everything its own pages need (facts with
                       sources, opportunities, reach by country), loaded when a page opens
  site/artifact.html   the same page as an artifact body

When the per-language files are small in total (EMBED_LIMIT), they are also embedded in the page,
so it works opened straight from disk. Otherwise serve the site folder over HTTP
(python -m http.server -d site) or from GitHub Pages.
"""

from __future__ import annotations

import json
import shutil

from . import DATA, ROOT

SITE = ROOT / "site"
EMBED_LIMIT = 3_000_000  # bytes of per-language data to embed in the page
TOP_OPPORTUNITIES = 1000  # opportunities listed on the Opportunities page before choosing a language
SUMMARY = ("code", "name", "autonym", "iso_639_3", "speakers", "region", "ltdi", "rank", "gaps")
PROFILE = ("script_names", "note", "source")  # shown only on the language's own page
# Left out of a language's country list: places with no permanent population, and CLDR's
# pseudo-regions (LinguaMeta lists them without speaker counts)
NOT_PLACES = {"aq", "bv", "gs", "hm", "tf", "um", "xa", "xb", "zz"}


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
    for l in scores["languages"]:
        facts = {}
        for ind, f in scores["facts"].get(l["code"], {}).items():
            key = (f["source"], f["url"], f["retrieved"], f["method"])
            facts[ind] = [f["value"], sources.setdefault(key, len(sources))] + ([f["note"]] if f["note"] else [])
            units[ind] = f["unit"]
        opps = []
        for o in l["opportunities"]:
            o = {k: v for k, v in o.items() if k not in ("teams", "missing", "starter")}
            o["kit"] = [[k["indicator"], k["size"]] for k in o["kit"]]
            opps.append(o)
            top.append({k: o[k] for k in ("id", "key", "type", "technology", "title", "why",
                                          "priority", "priority_now", "priority_5y")} | {"lang": l["code"]})
        details[l["code"]] = {"dimensions": l["dimensions"], "facts": facts, "opportunities": opps,
                              "reach_by_country": l["reach_by_country"],
                              "countries": [c["name"] for c in l["countries"] if c["code"] not in NOT_PLACES]}
                             | {k: l.get(k) for k in PROFILE}
        langs.append({k: l.get(k) for k in SUMMARY} | {
            "scores": {k: d["score"] for k, d in l["dimensions"].items()},
            "levels": "".join(l["levels"][t][0] for t in techs),  # f(ull) p(art) o(pen) n(one), in config order
            "offers": [svc_index[i] for i in l["offers"]],
            "opportunity_count": len(opps),
        })
    top.sort(key=lambda o: (-o["priority_5y"], o["id"]))
    hist = scores.get("history")
    if hist:  # one string per language and series: 1, 0, or . (no data) for each period
        periods = hist["periods"]
        hist = {**hist, "values": {s: {c: "".join(".01"[v[p] + 1] if p in v else "." for p in periods)
                                       for c, v in by.items()} for s, by in hist["values"].items()}}
    index = {k: scores[k] for k in ("edition", "labels", "config", "services", "rules", "resources",
                                    "opportunity_types", "teams")}
    index |= {"history": hist, "languages": langs, "top_opportunities": top[:TOP_OPPORTUNITIES],
              "opportunity_total": len(top), "units": units,
              "sources": [list(k) for k in sorted(sources, key=sources.get)]}
    return index, details


def main() -> None:
    scores = json.loads((DATA / "scores.json").read_text(encoding="utf-8"))
    index, details = split(scores)
    out = SITE / "data" / "lang"
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    total = 0
    for code, d in details.items():
        text = _dump(d)
        total += len(text.encode())
        (out / f"{code}.json").write_text(text, encoding="utf-8")
    embed = _dump(details) if total <= EMBED_LIMIT else "null"

    template = (SITE / "template.html").read_text(encoding="utf-8")
    page = template.replace("/*__DATA__*/", _dump(index).replace("</", "<\\/"))
    page = page.replace("/*__LANGS__*/", embed.replace("</", "<\\/"))
    if (DATA / "basemap.json").exists() and (DATA / "world_languages.json").exists():
        geo = '{"basemap":' + (DATA / "basemap.json").read_text(encoding="utf-8") + ',"points":' + \
              (DATA / "world_languages.json").read_text(encoding="utf-8") + '}'
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
          f"{len(details)} language files {total / 1e6:.2f} MB, {'embedded' if embed != 'null' else 'loaded on demand'})")


if __name__ == "__main__":
    main()
