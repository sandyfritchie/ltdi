"""Writing system: is the language's main script encoded in Unicode?

Uses each language's main script (LinguaMeta's canonical one, else QQ's or an override), checked against the
scripts CLDR knows (cldr-core scriptMetadata.json), which are all encoded.
"""

from __future__ import annotations

import json

from .. import DATA
from ..http import fetch_json
from ..records import Record

URL = "https://raw.githubusercontent.com/unicode-org/cldr-json/7d2b9cb11cec08f4d333ad73209deb3df0711c3b/cldr-json/cldr-core/scriptMetadata.json"


def collect() -> list[Record]:
    encoded = {s.lower() for s in fetch_json(URL)["scriptMetadata"]}
    out = []
    for lang in json.loads((DATA / "languages.json").read_text(encoding="utf-8")):
        main = (lang["scripts"] or ["xxxx"])[0]
        out.append(Record(lang["code"], "script_encoded", 1 if main in encoded else 0, "bool",
                          "Unicode CLDR script metadata", URL, note=f"Main script: {main}"))
    return out
