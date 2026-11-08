from __future__ import annotations

import json

from .. import DATA


def ltdi_codes() -> list[str]:
    return [l["code"] for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))]
