"""Unicode CLDR: locale data coverage level (modern / moderate / basic / none)."""

from __future__ import annotations

from collections import defaultdict

from ..crosswalk import to_ltdi
from ..http import fetch_json
from ..records import Record
from ._common import ltdi_codes

URL = "https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-core/coverageLevels.json"
LEVELS = {"modern": 3, "moderate": 2, "basic": 1}


def collect() -> list[Record]:
    data = fetch_json(URL)["effectiveCoverageLevels"]
    best: dict[str, int] = defaultdict(int)
    for locale, level in data.items():
        code = to_ltdi(locale)
        if code:
            best[code] = max(best[code], LEVELS.get(level, 0))
    return [
        Record(code, "cldr_coverage", best.get(code, 0), "level 0-3", "Unicode CLDR", URL,
               note="3 modern, 2 moderate, 1 basic, 0 not in CLDR")
        for code in ltdi_codes()
    ]
