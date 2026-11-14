"""Checks on the committed records and config, so a collector or config change can't silently leave an
indicator uncollected or a language counted twice (E4)."""
import csv
from collections import Counter

from ltdi import DATA
from ltdi.config import load_config, services


def records(manual=True):
    """Rows of every records file (and of the hand-read lists, which have an indicator column too)."""
    for p in sorted((DATA / "records").glob("*.csv")) + (sorted((DATA / "manual").glob("*.csv")) if manual else []):
        with p.open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                yield p.name, r


def test_no_language_has_an_indicator_twice():
    seen = Counter((r["language"], r["indicator"]) for _, r in records() if "language" in r and r.get("indicator"))
    dup = [k for k, n in seen.items() if n > 1]
    assert not dup, dup[:10]


def test_every_scored_indicator_is_collected():
    have = {r["indicator"] for _, r in records() if r.get("indicator")}
    cfg = load_config()
    needed = set(cfg["dimensions"]["data"]["indicators"])
    for t in cfg["dimensions"]["tech"]["technologies"].values():
        needed |= set(t.get("consumer", [])) | set(t.get("open", [])) | set(t.get("measured", {}))
        if "indicator" in t:
            needed.add(t["indicator"])
    assert not needed - have, sorted(needed - have)


def test_every_service_is_in_the_records():
    have = {r["indicator"] for _, r in records() if r.get("indicator")}
    missing = [s["id"] for s in services() if s["id"] not in have]
    assert not missing, missing


def test_values_are_numbers_and_dates_are_dates():
    import datetime as dt
    for name, r in records(manual=False):
        float(r["value"])
        dt.date.fromisoformat(r["retrieved"])
