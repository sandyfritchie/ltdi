"""How much each language's rank depends on the method's working choices.

    python -m ltdi.sensitivity [--draws 1000]      # after python -m ltdi.score

Re-scores every language under many alternative methods, each drawn at random within a range of
reasonable choices, and records where each language ranks:

  weights      each technology's and each data indicator's weight times a factor from 0.5 to 1.5
  goalposts    each log-scale data goal (where an indicator reaches 1) up to ten times higher or lower;
               the benchmark count's goal times 0.5 to 1.5
  floor        from 0.025 to 0.075

Technology scores themselves don't change (they don't depend on these choices), so each draw
re-weights the stored technology scores and re-normalises the stored data values, exactly as
ltdi.score does. Ranks are competition ranks on the same key (LTDI, then the unfloored dimensions).

Writes data/sensitivity.csv (each language's 5th, 50th and 95th percentile rank and LTDI) and
data/sensitivity.json (a summary by rank band, and fixed scenarios: voice assistants at full weight
or none, every technology weighted equally). Seeded, so the output is the same on every run."""

from __future__ import annotations

import argparse
import json
import math
import random

from . import DATA
from .score import normalise
from .stats import spearman

SEED = 2026
BANDS = [(1, 60), (61, 200), (201, 1000), (1001, 10 ** 6)]


def load() -> tuple[dict, list[dict]]:
    scores = json.loads((DATA / "scores.json").read_text(encoding="utf-8"))
    cfg = scores["config"]
    langs = []
    data_spec = cfg["dimensions"]["data"]["indicators"]
    for l in scores["languages"]:
        if not l.get("rank"):
            continue
        facts = scores["facts"].get(l["code"], {})
        data = {}
        for ind, spec in data_spec.items():
            if ind in facts:
                narrow = spec.get("narrowed_by")
                share = min(1.0, max(0.0, facts[narrow]["value"])) if narrow and narrow in facts else None
                data[ind] = (facts[ind]["value"], share)
        langs.append({"code": l["code"], "name": l["name"], "rank": l["rank"], "ltdi": l["ltdi"], "tier": l["tier"], "data": data,
                      "tech": l["dimensions"]["tech"]["indicators"]})
    return cfg, langs


def method(cfg: dict, rng: random.Random | None = None, **fixed) -> dict:
    """The method's choices: as configured (rng None), or drawn at random; `fixed` overrides weights."""
    u = (lambda a, b: rng.uniform(a, b)) if rng else (lambda a, b: 1.0)
    data = {}
    for ind, spec in cfg["dimensions"]["data"]["indicators"].items():
        s = dict(spec)
        s["weight"] = spec["weight"] * u(0.5, 1.5)
        if rng and spec.get("scale") == "log":
            s["max"] = max(float(spec["min"]) * 10 + 10, float(spec["max"]) * 10 ** rng.uniform(-1, 1))
        elif rng and spec.get("scale") == "linear":
            s["max"] = float(spec["max"]) * u(0.5, 1.5)
        data[ind] = s
    tech = {k: t["weight"] * u(0.5, 1.5) for k, t in cfg["dimensions"]["tech"]["technologies"].items()}
    tech.update(fixed)
    floor = rng.uniform(0.025, 0.075) if rng else cfg["meta"]["floor"]
    return {"data": data, "tech": tech, "floor": floor}


def score_all(langs: list[dict], m: dict) -> list[tuple[float, float]]:
    """(LTDI, mean unfloored dimension) for each language, as ltdi.score computes them."""
    out = []
    for l in langs:
        parts = []
        for ind, (v, share) in l["data"].items():
            spec = m["data"][ind]
            n = normalise(v, spec)
            if share is not None:
                n *= 1 - (1 - spec.get("narrow_floor", 0.5)) * share
            parts.append((n, spec["weight"]))
        tw = sum(w for _, w in parts)
        data = sum(n * w for n, w in parts) / tw if tw else 0.0
        tparts = [(s, m["tech"][k]) for k, s in l["tech"].items()]
        tw = sum(w for _, w in tparts)
        tech = sum(s * w for s, w in tparts) / tw if tw else 0.0
        d, t = round(max(m["floor"], data), 4), round(max(m["floor"], tech), 4)
        out.append((round(math.sqrt(d * t), 4), (round(data, 4) + round(tech, 4)) / 2))
    return out


def competition_ranks(keys: list[tuple[float, float]]) -> list[int]:
    order = sorted(range(len(keys)), key=lambda i: (-keys[i][0], -keys[i][1]))
    rank = [0] * len(keys)
    for pos, i in enumerate(order):
        rank[i] = rank[order[pos - 1]] if pos and keys[order[pos - 1]] == keys[i] else pos + 1
    return rank


def pct(xs: list[float], p: float) -> float:
    s = sorted(xs)
    return s[min(len(s) - 1, max(0, round(p / 100 * (len(s) - 1))))]


def main() -> None:
    ap = argparse.ArgumentParser(description="Rank ranges under alternative methods")
    ap.add_argument("--draws", type=int, default=1000)
    a = ap.parse_args()
    cfg, langs = load()
    base = score_all(langs, method(cfg))
    mism = sum(1 for l, (v, _) in zip(langs, base) if abs(v - l["ltdi"]) > 1e-4)
    if mism:
        raise SystemExit(f"re-scoring doesn't reproduce ltdi.score for {mism} languages; is data/scores.json current?")
    base_rank = competition_ranks(base)
    rng = random.Random(SEED)
    ranks: list[list[int]] = [[] for _ in langs]
    ltdis: list[list[float]] = [[] for _ in langs]
    for _ in range(a.draws):
        keys = score_all(langs, method(cfg, rng))
        for i, (r, k) in enumerate(zip(competition_ranks(keys), keys)):
            ranks[i].append(r)
            ltdis[i].append(k[0])
    rows = []
    for i, l in enumerate(langs):
        rows.append({"code": l["code"], "name": l["name"], "rank": base_rank[i],
                     "rank_p5": pct(ranks[i], 5), "rank_p50": pct(ranks[i], 50), "rank_p95": pct(ranks[i], 95),
                     "ltdi": base[i][0], "ltdi_p5": pct(ltdis[i], 5), "ltdi_p95": pct(ltdis[i], 95)})
    cols = list(rows[0])
    (DATA / "sensitivity.csv").write_text(
        ",".join(cols) + "\n" + "".join(",".join(str(r[c]) for c in cols) + "\n" for r in rows), encoding="utf-8")

    bands = []
    nothing = {l["code"] for l in langs if l["tier"] == "ln"}  # nothing recorded: always last, together
    for lo, hi in BANDS:
        sel = [r for r in rows if lo <= r["rank"] <= hi and r["code"] not in nothing]
        if not sel:
            continue
        widths = sorted(r["rank_p95"] - r["rank_p5"] for r in sel)
        bands.append({"ranks": f"{lo:,}–{hi:,}" if hi < 10 ** 6 else f"{lo:,} and below", "languages": len(sel),
                      "median_range": widths[len(widths) // 2],
                      "within_10pct": round(sum(1 for r in sel if r["rank_p95"] - r["rank_p5"] <= 0.2 * r["rank"]) / len(sel), 3)})
    scenarios = []
    techs = cfg["dimensions"]["tech"]["technologies"]
    for label, fixed in [("Voice assistants at full weight", {"assistant": 1.0}),
                         ("Voice assistants left out", {"assistant": 0.0}),
                         ("Every technology weighted equally", {k: 1.0 for k in techs})]:
        keys = score_all(langs, method(cfg) | {"tech": {**method(cfg)["tech"], **fixed}})
        rk = competition_ranks(keys)
        top = [i for i in range(len(langs)) if min(base_rank[i], rk[i]) <= 300]
        moves = sorted(((abs(rk[i] - base_rank[i]), langs[i]["name"], base_rank[i], rk[i]) for i in top), reverse=True)
        scenarios.append({"label": label, "spearman": round(spearman(base_rank, rk), 4),
                          "moved_10_in_top_300": sum(1 for m in moves if m[0] > 10),
                          "largest": [{"name": n, "from": f, "to": t} for _, n, f, t in moves[:5]]})
    summary = {"draws": a.draws, "seed": SEED, "edition": cfg["meta"]["edition"],
               "varied": "technology and data weights x0.5-1.5; log-scale data goals up to 10x either way, "
                         "the benchmark goal x0.5-1.5; floor 0.025-0.075",
               "nothing_recorded": len(nothing), "bands": bands, "scenarios": scenarios}
    (DATA / "sensitivity.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{a.draws} draws over {len(langs):,} languages")
    for b in bands:
        print(f"  ranks {b['ranks']:<12} median 90% range {b['median_range']:>5} places; "
              f"{b['within_10pct'] * 100:.0f}% stay within ±10% of their rank")
    for s in scenarios:
        print(f"  {s['label']}: Spearman {s['spearman']}, {s['moved_10_in_top_300']} of the top 300 move more than 10 places; "
              + ", ".join(f"{m['name']} {m['from']}->{m['to']}" for m in s["largest"][:3]))


if __name__ == "__main__":
    main()
