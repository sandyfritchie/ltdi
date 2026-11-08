"""FLORES-200: language list for the FLORES-200 evaluation set and NLLB-200.

NLLB-200 was trained and evaluated on exactly the FLORES-200 languages, so the
same list gives one data indicator (an MT evaluation set exists) and one
technology indicator (an open MT model supports the language).
"""

from __future__ import annotations

import re

from ..http import fetch_text
from ..records import Record
from . import present
from ._common import ltdi_codes

URL = "https://raw.githubusercontent.com/facebookresearch/flores/main/flores200/README.md"


def collect() -> list[Record]:
    codes = re.findall(r"\|\s*([a-z]{3}_[A-Z][a-z]{3})\s*$", fetch_text(URL), flags=re.M)
    have = present(codes)
    out = []
    for code in ltdi_codes():
        v = 1 if code in have else 0
        out.append(Record(code, "flores200", v, "bool", "FLORES-200", URL))
        out.append(Record(code, "mt_open_nllb", v, "bool", "NLLB-200 (via FLORES-200 list)", URL))
    return out
