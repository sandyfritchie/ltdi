"""Mozilla Common Voice: validated hours of transcribed speech per language."""

from __future__ import annotations

from ..http import fetch_json
from ..records import Record
from . import sum_by_language
from ._common import ltdi_codes

# Latest full release file in github.com/common-voice/cv-dataset/tree/main/datasets/scripted-speech
RELEASE = "cv-corpus-27.0-2026-09-11"
URL = f"https://raw.githubusercontent.com/common-voice/cv-dataset/main/datasets/scripted-speech/{RELEASE}.json"


def collect() -> list[Record]:
    locales = fetch_json(URL)["locales"]
    hours = sum_by_language((loc, float(v.get("validHrs") or 0)) for loc, v in locales.items())
    return [
        Record(code, "cv_validated_hours", hours.get(code, 0.0), "hours", f"Common Voice {RELEASE}", URL)
        for code in ltdi_codes()
    ]
