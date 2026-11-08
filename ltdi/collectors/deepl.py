"""DeepL: languages available for text translation, and how many features each has.

DeepL's docs generate their language table from the API into a JSX snippet in
github.com/DeepLcom/api-docs, which is easier to parse than the rendered page.
Feature depth counts glossaries, translation memory, style rules and text
improvement (DeepL Write) for each language.
"""

from __future__ import annotations

import re
from collections import defaultdict

from ..crosswalk import to_ltdi
from ..http import fetch_text
from ..records import Record
from ._common import ltdi_codes

URL = "https://raw.githubusercontent.com/DeepLcom/api-docs/main/snippets/language-table.jsx"
FEATURES = ["glossaries", "translationMemory", "styleRules", "textImprovement"]


def collect() -> list[Record]:
    src = fetch_text(URL)
    has: set[str] = set()
    feats: dict[str, set[str]] = defaultdict(set)
    for entry in re.findall(r"\{\s*code:\s*'[^']+'[^}]*\}", src):
        code = to_ltdi(re.search(r"code:\s*'([^']+)'", entry).group(1).lower())
        if not code or not re.search(r"translation:\s*true", entry):
            continue
        has.add(code)
        for f in FEATURES:
            if re.search(rf"{f}:\s*true", entry):
                feats[code].add(f)
    out = []
    for code in ltdi_codes():
        out.append(Record(code, "mt_deepl", 1 if code in has else 0, "bool", "DeepL", URL))
        f = sorted(feats.get(code, set()))
        out.append(Record(code, "mt_deepl_features", len(f), "features of 4", "DeepL language features", URL,
                          note=("Has: " + ", ".join(f)) if f else "None of the four"))
    return out
