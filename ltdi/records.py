"""The common record format every collector emits.

One row = one fact about one language, with enough provenance to trace it
back to where it came from.
"""

from __future__ import annotations

import csv
import dataclasses
import datetime as dt
from collections import Counter
from pathlib import Path
from typing import Iterable

FIELDS = [
    "language",   # LTDI language code (LinguaMeta BCP-47 key)
    "indicator",  # indicator id, defined in config/methodology.toml
    "value",      # number; booleans are 1 / 0
    "unit",       # e.g. articles, hours, share, bool, level
    "source",     # human-readable source name
    "url",        # where the value was read from
    "retrieved",  # ISO date the bytes the value was read from were downloaded
    "method",     # api | scrape | download | manual
    "note",       # anything a reader needs to interpret the value
]


def _retrieved() -> str:
    """The download day of the oldest bytes the running collector has used (ltdi.http), or today."""
    from .http import oldest_fetch
    return oldest_fetch() or dt.date.today().isoformat()


@dataclasses.dataclass
class Record:
    language: str
    indicator: str
    value: float
    unit: str
    source: str
    url: str
    retrieved: str = dataclasses.field(default_factory=_retrieved)
    method: str = "download"
    note: str = ""


def write_records(path: Path, records: Iterable[Record]) -> int:
    """Write records, folding the most common zero row of each indicator ("not offered", "no hours") into one
    row with language "*": every language without a row of its own has value 0, with that row's note."""
    path.parent.mkdir(parents=True, exist_ok=True)
    records = list(records)
    rest = lambda r: tuple(v for k, v in dataclasses.asdict(r).items() if k not in ("language", "url"))
    common: dict[str, Counter] = {}
    for r in records:
        common.setdefault(r.indicator, Counter())
        if not r.value:
            common[r.indicator][rest(r)] += 1
    fold = {ind: (c.most_common(1) or [(None, 0)])[0] for ind, c in common.items()}
    rows, folded = [], {}
    for r in records:
        key, n = fold[r.indicator]
        if n and rest(r) == key:
            folded.setdefault(r.indicator, dataclasses.replace(r, language="*"))
        else:
            rows.append(dataclasses.asdict(r))
    rows += [dataclasses.asdict(r) for r in folded.values()]
    rows.sort(key=lambda r: (r["indicator"], r["language"]))
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    return len(rows)


def read_records(path: Path, languages: Iterable[str] | None = None) -> list[Record]:
    """Records from a CSV; a "*" row gives its value to every language in `languages` without its own row."""
    with path.open(newline="", encoding="utf-8") as f:
        rows = [Record(**{**row, "value": float(row["value"])}) for row in csv.DictReader(f)]
    out = [r for r in rows if r.language != "*"]
    have = {(r.language, r.indicator) for r in out}
    for d in (r for r in rows if r.language == "*"):
        out += [dataclasses.replace(d, language=l) for l in languages or [] if (l, d.indicator) not in have]
    return out


LIST_FIELDS = ["indicator", "unit", "source", "url", "retrieved", "absent", "values", "notes"]


def read_lists(path: Path, languages: Iterable[str]) -> list[Record]:
    """Hand-collected vendor lists, one row per indicator rather than per language.

    values  languages offered, space-separated: "en hi" means value 1; "en=4 hi=2" gives values
    notes   per-language notes, "hi: text | pt: text"; "*: text" applies to every language
    absent  value for languages not listed ("0" = checked, not offered); empty = not collected
    """
    out: list[Record] = []
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            vals = {}
            for tok in row["values"].split():
                lang, _, v = tok.partition("=")
                vals[lang] = float(v) if v else 1.0
            notes = dict(n.split(": ", 1) for n in row["notes"].split(" | ") if n)
            for lang in languages:
                v = vals.get(lang, float(row["absent"]) if row["absent"] != "" else None)
                if v is None:
                    continue
                out.append(Record(lang, row["indicator"], v, row["unit"], row["source"], row["url"],
                                  row["retrieved"], "manual", notes.get(lang, notes.get("*", ""))))
    return out


def write_lists(path: Path, records: Iterable[Record]) -> int:
    """Inverse of read_lists, for converting per-language files."""
    by: dict[str, list[Record]] = {}
    for r in records:
        by.setdefault(r.indicator, []).append(r)
    rows = []
    for ind, rs in sorted(by.items()):
        r0 = rs[0]
        bool_like = all(r.value in (0, 1) for r in rs) and r0.unit == "bool"
        listed = [r for r in rs if r.value]
        values = " ".join(r.language if bool_like else f"{r.language}={r.value:g}" for r in listed)
        notes = {r.language: r.note for r in rs if r.note}
        default = max(set(notes.values()), key=list(notes.values()).count) if len(notes) == len(rs) else None
        if default:  # every language has a note: give the commonest once, then the exceptions
            notes = {"*": default, **{k: v for k, v in notes.items() if v != default}}
        rows.append({"indicator": ind, "unit": r0.unit, "source": r0.source, "url": r0.url, "retrieved": r0.retrieved,
                     "absent": "0" if any(not r.value for r in rs) or len(rs) > len(listed) else "",
                     "values": values,
                     "notes": " | ".join(f"{k}: {v}" for k, v in notes.items())})
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=LIST_FIELDS)
        w.writeheader()
        w.writerows(rows)
    return len(rows)


def read_dir(directory: Path, languages: Iterable[str] | None = None) -> list[Record]:
    """Every *.csv record file in a directory; *.lists.csv files are vendor lists (read_lists)."""
    out: list[Record] = []
    for p in sorted(directory.glob("*.csv")):
        if p.name.endswith(".lists.csv"):
            out.extend(read_lists(p, languages or []))
        else:
            out.extend(read_records(p, languages))
    return out
