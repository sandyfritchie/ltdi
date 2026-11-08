"""Collectors: one module per source, each exposing collect() -> list[Record].

Run one:   python -m ltdi.collectors.fineweb2
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

AUTOMATED = ["scripts", "cldr", "fineweb2", "common_voice", "flores200", "belebele", "whisper", "deepl", "openai_mmmlu", "open_tools"]
LOCAL_ONLY = ["wikipedia"]
NEEDS_ALLOWLIST = ["connectivity", "mms"]  # api.worldbank.org, dl.fbaipublicfiles.com  # need network access the build sandbox lacks


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


def run(name: str) -> int:
    mod = importlib.import_module(f"{__name__}.{name}")
    records: list[Record] = mod.collect()
    n = write_records(DATA / "records" / f"{name}.csv", records)
    print(f"{name}: {n} records")
    return n


def main(argv=None) -> None:
    names = (argv or sys.argv[1:]) or AUTOMATED
    for name in names:
        run(name)


if __name__ == "__main__":
    main()
