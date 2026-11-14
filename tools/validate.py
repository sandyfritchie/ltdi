"""Compare LTDI with two outside classifications of the world's languages, and list where they
disagree most:

  Joshi et al. (2020), "The State and Fate of Linguistic Diversity and Inclusion in the NLP World":
    resource classes 0 to 5, from labelled and unlabelled data (in languages.json, via QQ)
  Simons, Thomas and White (2022), "Assessing Digital Language Support on a Global Scale": DLS
    levels (Still, Emerging, Ascending, Vital, Thriving) and scores from 143 tools' language lists,
    May 2021. Only a 10% systematic sample (783 languages) is public (sil-ai/dls-results); it is
    fetched here and not redistributed.

    python tools/validate.py      # after python -m ltdi.score; writes data/validation.json

The site's About page shows the result. Both classifications are older than LTDI's sources, so some
disagreement is progress since; the disagreement lists are for checking LTDI's method and data."""

from __future__ import annotations

import csv
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ltdi import DATA  # noqa: E402
from ltdi.http import fetch  # noqa: E402
from ltdi.stats import median, ranks, spearman  # noqa: E402

DLS_URL = "https://raw.githubusercontent.com/sil-ai/dls-results/main/DLS%20scores%20for%2010%25%20of%20languages.csv"
DLS_REPO = "https://github.com/sil-ai/dls-results"
DLS_LEVELS = ["Still", "Emerging", "Ascending", "Vital", "Thriving"]
JOSHI_NAMES = {0: "The Left-Behinds", 1: "The Scraping-Bys", 2: "The Hopefuls", 3: "The Rising Stars",
               4: "The Underdogs", 5: "The Winners"}
TOP = 30


def compare(pairs: list[tuple[dict, float, str]], groups: list, label) -> dict:
    """pairs: (language, outside value, outside label). groups: the outside measure's categories in order."""
    ltdi = [l["ltdi"] for l, _, _ in pairs]
    other = [v for _, v, _ in pairs]
    n = len(pairs)
    pl, po = ranks(ltdi), ranks(other)  # percentiles within the compared set
    rows = []
    for g in groups:
        sel = [l for l, _, lab in pairs if lab == g]
        tiers: dict[str, int] = {}
        for l in sel:
            tiers[l["tier"]] = tiers.get(l["tier"], 0) + 1
        rows.append({"group": g, "label": label(g), "n": len(sel),
                     "median_ltdi": round(median([l["ltdi"] for l in sel]), 3) if sel else None, "tiers": tiers})
    dis = []
    for i, (l, v, lab) in enumerate(pairs):
        d = (pl[i] - po[i]) / n
        dis.append({"code": l["code"], "name": l["name"], "ltdi": l["ltdi"], "rank": l["rank"], "tier": l["tier"],
                    "other": lab, "gap": round(d, 3)})
    dis.sort(key=lambda x: (-abs(x["gap"]), x["code"]))
    return {"n": n, "spearman": round(spearman(ltdi, other), 3), "groups": rows, "disagreements": dis[:TOP]}


def main() -> None:
    scores = json.loads((DATA / "scores.json").read_text(encoding="utf-8"))
    langs = [l for l in scores["languages"] if l.get("rank")]
    out = {"edition": scores["edition"],
           "methodology_version": scores["config"]["meta"].get("methodology_version")}

    # Joshi et al.: one class per language where QQ gives one
    pairs = [(l, l["joshi"], l["joshi"]) for l in langs if l.get("joshi") is not None]
    out["joshi"] = {**compare(pairs, list(range(6)), lambda g: f"{g} · {JOSHI_NAMES[g]}"),
                    "source": "https://aclanthology.org/2020.acl-main.560/", "as_of": "2020"}

    # DLS: matched by ISO 639-3 code, or to the macrolanguage that absorbs it
    by_iso = {l.get("iso_639_3"): l for l in langs if l.get("iso_639_3")}
    member_of = {m: l for l in langs for m in (l.get("members") or [])}
    rows = list(csv.DictReader(io.StringIO(fetch(DLS_URL).decode("utf-8-sig"))))
    seen, pairs = set(), []
    for r in rows:
        if r["Language_Type"] != "Living":
            continue
        l = by_iso.get(r["ISO_639"]) or member_of.get(r["ISO_639"])
        if l is None or l["code"] in seen:
            continue
        seen.add(l["code"])
        pairs.append((l, float(r["Proportional_Score"]), r["DLS_Level"]))
    level = {lv: i for i, lv in enumerate(DLS_LEVELS)}
    out["dls"] = {**compare(pairs, DLS_LEVELS, lambda g: g),
                  "spearman_level": round(spearman([l["ltdi"] for l, _, _ in pairs], [level[lab] for _, _, lab in pairs]), 3),
                  "source": DLS_REPO, "paper": "https://aclanthology.org/2022.coling-1.379/",
                  "as_of": "May 2021", "sample": f"{len(rows)} languages, a 10% systematic sample"}
    # The two studies against each other, and LTDI against each, on the languages all three cover: how
    # far two careful measures of the same thing differ is the yardstick for LTDI's differences
    common = [(l, v) for l, v, _ in pairs if l.get("joshi") is not None]
    j = [l["joshi"] for l, _ in common]
    d = [v for _, v in common]
    t = [l["ltdi"] for l, _ in common]
    out["between"] = {"n": len(common), "joshi_dls": round(spearman(j, d), 3),
                      "ltdi_joshi": round(spearman(t, j), 3), "ltdi_dls": round(spearman(t, d), 3)}
    (DATA / "validation.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    b = out["between"]
    print(f"on the {b['n']} languages all three cover: Joshi-DLS {b['joshi_dls']}, LTDI-Joshi {b['ltdi_joshi']}, LTDI-DLS {b['ltdi_dls']}")
    for k in ("joshi", "dls"):
        v = out[k]
        print(f"{k}: n {v['n']:,}, Spearman {v['spearman']}")
        for g in v["groups"]:
            print(f"   {g['label']:<28} n {g['n']:>5}  median LTDI {g['median_ltdi']}")
        print("   largest disagreements:")
        for x in v["disagreements"][:12]:
            print(f"     {x['name'][:28]:<29} LTDI {x['ltdi']:.3f} ({x['tier']}, rank {x['rank']}) vs {x['other']}  gap {x['gap']:+.2f}")


if __name__ == "__main__":
    main()
