"""Split the change in scores between an earlier version of the repo and now into the part that comes
from the method (config and code) and the part that comes from the data (records).

    python tools/edition_diff.py OLD_REF [--top 25] [--csv out.csv]

OLD_REF is any git commit, tag or branch (an earlier edition's commit, say). Three scorings:

    A  the earlier code and config on the earlier records   (what was published then)
    B  today's code and config on the earlier records        (the earlier data, re-scored)
    C  today's code and config on today's records            (what is published now)

B - A is the method's effect, C - B the data's. The earlier version is unpacked into a temporary
folder with git archive and scored there; B points today's code at its data/ through LTDI_DATA.
Needs no network. Run from the repository root."""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def score(cwd: Path, data: Path | None = None) -> dict[str, dict]:
    env = {k: v for k, v in os.environ.items() if k != "LTDI_DATA"}
    if data:
        env["LTDI_DATA"] = str(data)
    subprocess.run([sys.executable, "-m", "ltdi.score"], cwd=cwd, env=env, check=True, stdout=subprocess.DEVNULL)
    out = json.loads(((data or cwd / "data") / "scores.json").read_text(encoding="utf-8"))
    return {"edition": out.get("edition"), "version": out.get("config", {}).get("meta", {}).get("methodology_version", "1.x"),
            "langs": {l["code"]: {"name": l["name"], "ltdi": l["ltdi"], "rank": l.get("rank"), "speakers": l.get("speakers") or 0}
                      for l in out["languages"] if not l.get("extinct")}}


def ranks(xs: list[float]) -> list[float]:
    """Average ranks, for Spearman's correlation with ties."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def spearman(a: list[float], b: list[float]) -> float:
    ra, rb = ranks(a), ranks(b)
    n = len(a)
    ma, mb = sum(ra) / n, sum(rb) / n
    cov = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    va = sum((x - ma) ** 2 for x in ra) ** 0.5
    vb = sum((y - mb) ** 2 for y in rb) ** 0.5
    return cov / (va * vb) if va and vb else 1.0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("old_ref")
    ap.add_argument("--top", type=int, default=25, help="movers to list for each part")
    ap.add_argument("--csv", help="write every language's three scores and ranks here")
    a = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        old = Path(tmp) / "old"
        old.mkdir()
        archive = subprocess.run(["git", "archive", a.old_ref], cwd=ROOT, check=True, capture_output=True).stdout
        subprocess.run(["tar", "-x", "-C", str(old)], input=archive, check=True)
        print(f"scoring {a.old_ref} as it was (A) ...", file=sys.stderr)
        A = score(old)
        print("scoring its records with today's method (B) ...", file=sys.stderr)
        B = score(ROOT, old / "data")
        print("scoring today's records (C) ...", file=sys.stderr)
        C = score(ROOT)
    codes = [c for c in C["langs"] if c in A["langs"] and c in B["langs"]]
    print(f"A {a.old_ref}: edition {A['edition']}, method {A['version']}  ->  C now: edition {C['edition']}, method {C['version']}")
    print(f"{len(codes):,} living languages in both "
          f"({len(set(C['langs']) - set(A['langs'])):,} new, {len(set(A['langs']) - set(C['langs'])):,} gone)\n")
    get = lambda S, k: [S["langs"][c][k] for c in codes]
    mean_abs = lambda X, Y: sum(abs(x - y) for x, y in zip(X, Y)) / len(codes)
    rows = [("method (A -> B)", A, B), ("data (B -> C)", B, C), ("both (A -> C)", A, C)]
    print(f"{'change':<18}{'mean |dLTDI|':>13}{'Spearman':>10}{'moved >20 places':>18}")
    for label, X, Y in rows:
        moved = sum(1 for c in codes if X["langs"][c]["rank"] and Y["langs"][c]["rank"]
                    and abs(X["langs"][c]["rank"] - Y["langs"][c]["rank"]) > 20)
        print(f"{label:<18}{mean_abs(get(X, 'ltdi'), get(Y, 'ltdi')):>13.4f}{spearman(get(X, 'ltdi'), get(Y, 'ltdi')):>10.3f}{moved:>18,}")
    for label, X, Y in rows[:2]:
        print(f"\nlargest moves from the {label.split()[0]}, among the top 500 either side:")
        mv = [(c, X["langs"][c]["rank"], Y["langs"][c]["rank"]) for c in codes
              if X["langs"][c]["rank"] and Y["langs"][c]["rank"] and min(X["langs"][c]["rank"], Y["langs"][c]["rank"]) <= 500]
        dl = lambda c: abs(X["langs"][c]["ltdi"] - Y["langs"][c]["ltdi"])
        mv = [m for m in mv if m[1] != m[2] or dl(m[0]) >= 0.0005]
        mv.sort(key=lambda m: (-abs(m[1] - m[2]), -dl(m[0])))
        if not mv:
            print("  none")
        for c, r0, r1 in mv[:a.top]:
            print(f"  {C['langs'][c]['name'][:30]:<31}{c:<9}{r0:>6} -> {r1:<6}"
                  f"{X['langs'][c]['ltdi']:.3f} -> {Y['langs'][c]['ltdi']:.3f}")
    if a.csv:
        with open(a.csv, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f, lineterminator="\n")
            w.writerow(["code", "name", "ltdi_a", "ltdi_b", "ltdi_c", "rank_a", "rank_b", "rank_c"])
            for c in codes:
                w.writerow([c, C["langs"][c]["name"], *(S["langs"][c]["ltdi"] for S in (A, B, C)),
                            *(S["langs"][c]["rank"] or "" for S in (A, B, C))])
        print(f"\nwrote {a.csv}")


if __name__ == "__main__":
    main()
