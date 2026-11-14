"""The top 50 and a set of sentinel languages, as committed in this edition's table: a change to the
method or data that moves any of them shows up here, for review, before it ships (E4).

After a deliberate change, update the reference:  UPDATE_GOLDEN=1 python -m pytest tests/test_golden.py"""
import csv
import os
from pathlib import Path

from ltdi import DATA
from ltdi.config import load_config

GOLDEN = Path(__file__).parent / "fixtures" / "golden.csv"
# Languages the review watched: the ceiling, benchmarked giants, spoken varieties and their standards,
# languages the old method displaced, and the tail
SENTINELS = ["en", "de", "ja", "hi", "ksh", "gsw", "arz", "apd", "yue", "prs", "pbt", "am", "zu", "yo", "km",
             "qu", "ht", "chr", "tpi", "aom", "aad"]
COLS = ["code", "rank", "tied", "ltdi", "tier", "technology", "data"]


def current() -> list[dict]:
    edition = load_config()["meta"]["edition"]
    with (DATA / "editions" / f"{edition}.csv").open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    keep = {r["code"] for r in rows[:50]} | set(SENTINELS)
    return [{c: r[c] for c in COLS} for r in rows if r["code"] in keep]


def test_top_50_and_sentinels_unchanged():
    rows = current()
    if os.environ.get("UPDATE_GOLDEN"):
        with GOLDEN.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=COLS, lineterminator="\n")
            w.writeheader()
            w.writerows(rows)
    with GOLDEN.open(encoding="utf-8") as f:
        golden = list(csv.DictReader(f))
    changed = [(g, r) for g, r in zip(golden, rows) if g != r] + [(None, r) for r in rows[len(golden):]]
    assert len(golden) == len(rows) and not changed, \
        "moved: " + "; ".join(f"{(g or {}).get('code')} {(g or {}).get('rank')}->{r['code']} {r['rank']}" for g, r in changed[:10])
