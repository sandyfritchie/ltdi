"""The common record format every collector emits.

One row = one fact about one language, with enough provenance to trace it
back to where it came from.
"""

from __future__ import annotations

import csv
import dataclasses
import datetime as dt
from pathlib import Path
from typing import Iterable

FIELDS = [
    "language",   # LTDI language code (LinguaMeta BCP-47 key)
    "indicator",  # indicator id, defined in config/methodology.toml
    "value",      # number; booleans are 1 / 0
    "unit",       # e.g. articles, hours, share, bool, level
    "source",     # human-readable source name
    "url",        # where the value was read from
    "retrieved",  # ISO date the value was read
    "method",     # api | scrape | download | manual
    "note",       # anything a reader needs to interpret the value
]


@dataclasses.dataclass
class Record:
    language: str
    indicator: str
    value: float
    unit: str
    source: str
    url: str
    retrieved: str = dataclasses.field(default_factory=lambda: dt.date.today().isoformat())
    method: str = "download"
    note: str = ""


def write_records(path: Path, records: Iterable[Record]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [dataclasses.asdict(r) for r in records]
    rows.sort(key=lambda r: (r["indicator"], r["language"]))
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    return len(rows)


def read_records(path: Path) -> list[Record]:
    with path.open(newline="", encoding="utf-8") as f:
        return [
            Record(**{**row, "value": float(row["value"])})
            for row in csv.DictReader(f)
        ]


def read_dir(directory: Path) -> list[Record]:
    out: list[Record] = []
    for p in sorted(directory.glob("*.csv")):
        out.extend(read_records(p))
    return out
