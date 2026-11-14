"""Unicode CLDR: locale data coverage level (modern / moderate / basic / none)."""

from __future__ import annotations

from collections import defaultdict

from ..crosswalk import to_ltdi
from ..http import fetch_json
from ..records import Record
from ._common import ltdi_codes

URL = "https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-core/coverageLevels.json"
LEVELS = {"modern": 3, "moderate": 2, "basic": 1}


NOTE = "3 modern, 2 moderate, 1 basic, 0 not in CLDR"
BELOW_BASIC = "In CLDR, below basic coverage (CLDR: undetermined)"


def collect() -> list[Record]:
    """A language's best locale level. A locale CLDR lists as "undetermined" (Malagasy, Shona, Lingala...)
    scores 0 like a language with no locale, but says so: it needs completing, not adding."""
    data = fetch_json(URL)["effectiveCoverageLevels"]
    best: dict[str, int] = defaultdict(int)
    listed: set[str] = set()
    for locale, level in data.items():
        code = to_ltdi(locale)
        if code:
            best[code] = max(best[code], LEVELS.get(level, 0))
            listed.add(code)
    return [
        Record(code, "cldr_coverage", best.get(code, 0), "level 0-3", "Unicode CLDR", URL,
               note=BELOW_BASIC if code in listed and not best.get(code) else NOTE)
        for code in ltdi_codes()
    ]
