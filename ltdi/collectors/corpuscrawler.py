"""Word-frequency lists from Corpus Crawler (github.com/google/corpuscrawler).

Corpus Crawler crawls web pages known to be in a language (often Bible and news sites) and publishes, for
each of about 1,000 languages, a list of the words it found with their counts, though not the text itself.
The lists also feed Unicode's Unilex project. They're useful for predictive keyboards and spelling
checkers, so they appear in those readiness checklists and on language pages, but they aren't scored: the
web text behind them is mostly what FineWeb-2 already measures.

  wordlist_corpuscrawler   tokens counted for the language (README's table), with a link to the list

Run:  python -m ltdi.collectors corpuscrawler
"""

from __future__ import annotations

import re

from ..crosswalk import to_ltdi
from ..http import fetch_text
from ..records import Record

COMMIT = "501495d13d65a6f1b7c46b982486e179826be096"  # pinned; update deliberately and re-run
README = f"https://raw.githubusercontent.com/google/corpuscrawler/{COMMIT}/README.md"
LIST = "https://www.gstatic.com/i18n/corpora/wordcounts/{code}.txt"
SOURCE = "Corpus Crawler word-frequency lists"
UNIT = {"": 1, "K": 1e3, "M": 1e6, "G": 1e9}


def table() -> list[tuple[str, str, float]]:
    """(Corpus Crawler's code, its name, tokens) for each row of the README's language table."""
    rows = re.findall(r"^\|\s*`([^`]+)`\s*\|\s*([^|]*?)\s*\|\s*([\d.]+)([KMG]?)\b", fetch_text(README), flags=re.M)
    return [(c, n, float(v) * UNIT[u]) for c, n, v, u in rows]


def collect() -> list[Record]:
    best: dict[str, tuple[float, str, str]] = {}
    for cc, name, tokens in table():
        code = to_ltdi(cc)
        if code and tokens > best.get(code, (0,))[0]:  # two lists for one language (scripts): the larger
            best[code] = (tokens, cc, name)
    if len(best) < 900:
        raise RuntimeError(f"corpuscrawler: only {len(best)} languages read from {README}; has the table changed?")
    return [Record(code, "wordlist_corpuscrawler", tokens, "tokens", SOURCE, LIST.format(code=cc),
                   note=f"Word list for {name} ({cc}), from {tokens:,.0f} tokens of crawled web text")
            for code, (tokens, cc, name) in sorted(best.items())]
