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
from ._common import presence

URL = "https://raw.githubusercontent.com/facebookresearch/flores/main/flores200/README.md"


def collect() -> list[Record]:
    codes = re.findall(r"\|\s*([a-z]{3}_[A-Z][a-z]{3})\s*$", fetch_text(URL), flags=re.M)
    have = present(codes)
    return presence("flores200", have, "FLORES-200", URL) + presence("mt_open_nllb", have, "NLLB-200 (via FLORES-200 list)", URL)
