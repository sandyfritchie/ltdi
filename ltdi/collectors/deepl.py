"""DeepL: languages available for text translation.

DeepL's docs generate their language table from the API into a JSX snippet in
github.com/DeepLcom/api-docs, which is easier to parse than the rendered page.
"""

from __future__ import annotations

import re

from ..http import fetch_text
from ..records import Record
from . import present
from ._common import ltdi_codes

URL = "https://raw.githubusercontent.com/DeepLcom/api-docs/main/snippets/language-table.jsx"


def collect() -> list[Record]:
    src = fetch_text(URL)
    codes = re.findall(r"\{\s*code:\s*'([A-Z]{2,3}(?:-[A-Z]+)?)',[^}]*translation:\s*true", src)
    have = present(c.lower() for c in codes)
    return [Record(code, "mt_deepl", 1 if code in have else 0, "bool", "DeepL", URL) for code in ltdi_codes()]
