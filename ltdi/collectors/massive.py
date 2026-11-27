"""MASSIVE: virtual assistant requests, the kind of data a voice assistant is built from (shown, not scored).

  massive_utterances   requests in the language, as text, labelled by intent and slot

Amazon's MASSIVE 1.1 localises the English SLURP set of single-shot assistant requests (setting
alarms, playing music, asking questions) into 51 other languages through professional translators,
about 19,500 requests per locale. It is text, translated from English rather than how speakers
would naturally phrase a request, so it's a starting point for recording, not a spoken set.
The languages are read from the dataset card.

Run:  python -m ltdi.collectors massive   (needs huggingface.co)
"""

from __future__ import annotations

import re
from collections import defaultdict

from ..crosswalk import to_ltdi
from ..http import fetch_text
from ..records import Record

CARD = "https://huggingface.co/datasets/AmazonScience/massive/raw/main/README.md"
PAGE = "https://huggingface.co/datasets/AmazonScience/massive"
PER_LOCALE = 19521  # utterances per locale, from the card's table


def collect() -> list[Record]:
    card = fetch_text(CARD)
    section = card[card.index("### Languages"):card.index("## Load the dataset")]
    locales = re.findall(r"\(([a-z]{2,3}-[A-Z]{2})\)", section)
    if len(locales) < 50:
        raise RuntimeError(f"MASSIVE card lists only {len(locales)} locales; check the card's format")
    by_code: dict[str, list[str]] = defaultdict(list)
    for loc in locales:
        code = to_ltdi(loc) or to_ltdi(loc.split("-")[0])
        if code:
            by_code[code].append(loc)
    return [Record(code, "massive_utterances", PER_LOCALE * len(locs), "utterances", "MASSIVE", PAGE,
                   method="scrape", note=f"Assistant requests as text, professionally translated from English and "
                                         f"labelled by intent; locale {', '.join(locs)}")
            for code, locs in sorted(by_code.items())]
