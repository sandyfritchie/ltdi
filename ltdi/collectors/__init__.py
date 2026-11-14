"""Collectors: one module per source, each exposing collect() -> list[Record].

Run one:   python -m ltdi.collectors fineweb2      (--accept, --refresh, --max-age DAYS: see main)
Run all:   python -m ltdi.collectors
Each writes data/records/<source>.csv in the common record format.
"""

from __future__ import annotations

import importlib
import sys
from collections import defaultdict

from .. import DATA
from ..crosswalk import to_ltdi
from ..records import Record, write_records

AUTOMATED = ["scripts", "cldr", "fineweb2", "common_voice", "flores200", "belebele", "whisper", "deepl", "openai_mmmlu", "openai_docs", "mt_quality", "regional", "afrobench", "omnilingual", "open_tools", "ud", "speech", "benchmarks", "opus", "hf_hub", "wikipedia", "connectivity", "mms", "vendors"]


def sum_by_language(pairs) -> dict[str, float]:
    """Sum (source_label, value) pairs into LTDI codes via the crosswalk."""
    out: dict[str, float] = defaultdict(float)
    for label, value in pairs:
        code = to_ltdi(label)
        if code:
            out[code] += value
    return dict(out)


def present(labels) -> set[str]:
    return {c for c in (to_ltdi(l) for l in labels) if c}


MANIFEST = DATA / "sources_manifest.csv"  # what each collector read: url, SHA-256, download day
DROP_LIMIT = 0.05  # a list losing more than this share of its languages stops the run (B3)
TOP_SPOKEN = 100   # nor may it lose any of this many most-spoken languages


def _covered(records) -> dict[str, set[str]]:
    out: dict[str, set[str]] = defaultdict(set)
    for r in records:
        if r.value:
            out[r.indicator].add(r.language)
    return out


def check_drops(name: str, old: dict[str, set[str]], new: dict[str, set[str]], top: list[str]) -> list[str]:
    """Print each indicator's languages added and removed since the last run; return the problems: a list
    that lost more than DROP_LIMIT of its languages, or any of the most-spoken ones."""
    problems = []
    names = {l: l for l in top}
    for ind in sorted(set(old) | set(new)):
        o, n = old.get(ind, set()), new.get(ind, set())
        gone, added = o - n, n - o
        if not gone and not added:
            continue
        print(f"  {ind}: {len(o):,} -> {len(n):,} languages"
              + (f"; added {', '.join(sorted(added)[:12])}{' ...' if len(added) > 12 else ''}" if added else "")
              + (f"; removed {', '.join(sorted(gone)[:12])}{' ...' if len(gone) > 12 else ''}" if gone else ""))
        big = [names[l] for l in top if l in gone]
        if o and len(gone) / len(o) > DROP_LIMIT:
            problems.append(f"{name}/{ind} lost {len(gone)} of {len(o)} languages")
        elif big:
            problems.append(f"{name}/{ind} lost {', '.join(big)}, among the {TOP_SPOKEN} most spoken")
    return problems


def _write_manifest(name: str) -> None:
    import csv

    from .. import http
    rows = []
    if MANIFEST.exists():
        with MANIFEST.open(encoding="utf-8") as f:
            rows = [r for r in csv.DictReader(f) if r["collector"] != name]
    rows += [{"collector": name, "url": u, "sha256": sha, "fetched": day} for u, (sha, day) in sorted(http.USED.items())]
    rows.sort(key=lambda r: (r["collector"], r["url"]))
    with MANIFEST.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["collector", "url", "sha256", "fetched"], lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def run(name: str, accept: bool = False) -> int:
    import json

    from .. import http
    from ..records import read_records
    http.reset()
    mod = importlib.import_module(f"{__name__}.{name}")
    records: list[Record] = mod.collect()
    path = DATA / "records" / f"{name}.csv"
    if path.exists():
        langs = json.loads((DATA / "languages.json").read_text(encoding="utf-8"))
        top = [l["code"] for l in sorted(langs, key=lambda l: -(l.get("speakers") or 0))[:TOP_SPOKEN]]
        problems = check_drops(name, _covered(read_records(path, [l["code"] for l in langs])), _covered(records), top)
        if problems and not accept:
            raise SystemExit(f"{name}: not written, since " + "; ".join(problems)
                             + ". Check the source; if the change is real, re-run with --accept.")
    n = write_records(path, records)
    _write_manifest(name)
    print(f"{name}: {n} records")
    return n


def main(argv=None) -> None:
    """python -m ltdi.collectors [names] [--accept] [--refresh] [--max-age DAYS]"""
    import argparse
    import os
    ap = argparse.ArgumentParser(description="Run collectors (all automated ones by default)")
    ap.add_argument("names", nargs="*")
    ap.add_argument("--accept", action="store_true", help="write records even if a list lost many languages")
    ap.add_argument("--refresh", action="store_true", help="download every source again")
    ap.add_argument("--max-age", type=int, help="download again anything cached more than this many days ago")
    a = ap.parse_args(argv)
    if a.refresh:
        os.environ["LTDI_REFRESH"] = "1"
    if a.max_age is not None:
        os.environ["LTDI_MAX_CACHE_DAYS"] = str(a.max_age)
    for name in a.names or AUTOMATED:
        run(name, a.accept)


if __name__ == "__main__":
    main()
