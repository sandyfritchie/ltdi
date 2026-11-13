"""Wikipedia: articles and active editors in each language edition.

Article counts measure volume but include bot-generated stubs; active editors
(registered users who edited in the last 30 days) measure the living community.

Some editions are mostly bot-generated: Cebuano has about 28,000 articles per active editor,
Waray 20,000, Egyptian Arabic 5,000, where large human-written editions have tens to a few hundred.
So an edition's articles count up to 1,000 per active editor (and at least 10,000 in all, since a
small community's editor count swings from month to month); the full count is kept in the note.

Read from one page, Meta-Wiki's sortable List of Wikipedias, which is refreshed from each
edition's own statistics several times a day. Each edition is credited to the LTDI language its
code resolves to (a few historical edition codes are mapped below). Editions that resolve to no
LTDI language, and the Simple English edition, are left out.

Run:  python -m ltdi.collectors wikipedia   (needs meta.wikimedia.org)
"""

from __future__ import annotations

from collections import defaultdict

from ..crosswalk import to_ltdi
from ..htmltables import tables
from ..http import fetch
from ..records import Record
from ._common import ltdi_codes

LIST = "https://meta.wikimedia.org/wiki/List_of_Wikipedias/sortable"
SKIP = {"simple"}
# Edition codes that are not language codes, or that mean something else as language codes
EDITION_CODE = {
    "als": "gsw",            # Alemannic (als is Tosk Albanian in ISO 639-3)
    "zh-yue": "yue", "zh-min-nan": "nan", "zh-classical": "lzh",
    "be-tarask": "be", "bat-smg": "sgs", "fiu-vro": "vro", "roa-rup": "rup",
    "cbk-zam": "cbk", "map-bms": "jv", "nds-nl": "nds", "roa-tara": "nap", "eml": "egl",
    "nrm": "nrf", "nah": "nhe", "bh": "bho",  # bh is the Bihari group code; the edition is Bhojpuri
}


PER_EDITOR = 1000   # articles counted per active editor
FLOOR = 10_000      # articles always counted in full


def counted(articles: int, editors: int) -> int:
    """Articles credited to an edition: beyond 1,000 per active editor, taken to be bot-generated."""
    return min(articles, max(FLOOR, PER_EDITOR * editors))


def _int(s: str) -> int:
    s = s.replace(",", "").strip()
    return int(s) if s.isdigit() else 0


def editions() -> dict[str, list[tuple[str, int, int]]]:
    """LTDI code -> [(edition, articles, active users)]"""
    out: dict[str, list] = defaultdict(list)
    for t in tables(fetch(LIST, cache=False).decode("utf-8")):
        head = t["rows"][0] if t["rows"] else []
        if "Articles" not in head or not any(h.startswith("Wiki") for h in head):
            continue
        col = {h.split("\n")[0].strip(): i for i, h in enumerate(head)}
        for row in t["rows"][1:]:
            if len(row) < len(head):
                continue
            wiki = row[col["Wiki"]].strip()
            code = None if wiki in SKIP else to_ltdi(EDITION_CODE.get(wiki, wiki))
            if code:
                out[code].append((wiki, _int(row[col["Articles"]]), _int(row[col["Active users"]])))
    return out


def collect() -> list[Record]:
    by_code = editions()
    out = []
    for code in ltdi_codes():
        eds = by_code.get(code, [])
        listed = sum(a for _, a, _ in eds)
        articles = sum(counted(a, e) for _, a, e in eds)
        editors = sum(e for _, _, e in eds)
        src = LIST + ("#" + eds[0][0] if eds else "")
        note = [("Editions: " + ", ".join(w for w, _, _ in eds))] if len(eds) > 1 else []
        if articles < listed:
            note.append(f"{listed:,} articles listed; counted up to {PER_EDITOR:,} per active editor, "
                        "since most beyond that are bot-generated")
        out.append(Record(code, "wikipedia_articles", articles, "articles", "Wikipedia", src, method="api",
                          note="; ".join(note)))
        out.append(Record(code, "wikipedia_active_editors", editors, "editors", "Wikipedia", src, method="api",
                          note="Registered users with an edit in the last 30 days" if editors else ""))
    return out
