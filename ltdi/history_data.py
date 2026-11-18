"""Reads data/history.csv (written by ltdi.collectors.history, changes only) back into a value for every
language at every half-year each series has a snapshot."""

from __future__ import annotations

import csv
import json
from collections import defaultdict

from . import DATA

PATH = DATA / "history.csv"


def read(codes=None) -> dict | None:
    """{"periods": every half-year, "series": {key: label}, "values": {series: {language: {period: 0 or 1}}},
    "sources": {series: source}}; None without a history. Languages are those in data/languages.json
    unless codes are given."""
    if not PATH.exists():
        return None
    if codes is None:
        codes = [l["code"] for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))]
    snaps: dict[str, list[str]] = defaultdict(list)
    changes: dict[str, dict[str, dict[str, int]]] = defaultdict(lambda: defaultdict(dict))
    sources = {}
    with PATH.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["language"] == "*":
                snaps[r["series"]].append(r["period"])
                sources[r["series"]] = r["source"]
            else:
                changes[r["series"]][r["language"]][r["period"]] = int(r["value"])
    values: dict[str, dict[str, dict[str, int]]] = {}
    for series, periods in snaps.items():
        periods.sort()
        col = values[series] = {}
        for c in sorted(codes):
            ch, v = changes[series].get(c, {}), 0
            col[c] = {}
            for p in periods:
                v = ch.get(p, v)
                col[c][p] = v
    labels = json.loads((DATA / "history_series.json").read_text(encoding="utf-8"))
    return {"periods": sorted({p for ps in snaps.values() for p in ps}), "series": labels, "values": values,
            "sources": sources}
