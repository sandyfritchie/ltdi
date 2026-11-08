"""Belebele: multilingual reading-comprehension benchmark (evaluation set exists)."""

from __future__ import annotations

import re

from ..http import fetch_text
from ..records import Record
from . import present
from ._common import ltdi_codes

URL = "https://raw.githubusercontent.com/facebookresearch/belebele/main/README.md"


def collect() -> list[Record]:
    codes = re.findall(r"^\s*\|?\s*([a-z]{3}_[A-Z][a-z]{3})\s*\|", fetch_text(URL), flags=re.M)
    have = present(codes)
    return [Record(code, "belebele", 1 if code in have else 0, "bool", "Belebele", URL) for code in ltdi_codes()]
