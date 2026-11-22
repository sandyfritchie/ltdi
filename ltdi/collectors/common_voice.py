"""Mozilla Common Voice: validated hours of transcribed speech per language, from its two collections.

  cv_validated_hours     Scripted Speech: volunteers read sentences aloud
  cv_spontaneous_hours   Spontaneous Speech: volunteers answer questions in their own words, and others
                         transcribe and check the answers (validated hours only)
"""

from __future__ import annotations

from ..http import fetch_json
from ..records import Record
from . import sum_by_language
from ._common import ltdi_codes

# Latest full release files in github.com/common-voice/cv-dataset/tree/main/datasets
COMMIT = "65ca2460d5e686ea03902a932bbca09b322dc4b0"
RELEASE = "cv-corpus-27.0-2026-09-11"
URL = f"https://raw.githubusercontent.com/common-voice/cv-dataset/{COMMIT}/datasets/scripted-speech/{RELEASE}.json"
SPS_RELEASE = "sps-corpus-5.0-2026-09-11"
SPS_URL = f"https://raw.githubusercontent.com/common-voice/cv-dataset/{COMMIT}/datasets/spontaneous-speech/{SPS_RELEASE}.json"


def collect() -> list[Record]:
    locales = fetch_json(URL)["locales"]
    hours = sum_by_language((loc, float(v.get("validHrs") or 0)) for loc, v in locales.items())
    sps = fetch_json(SPS_URL)["locales"]
    spont = sum_by_language((loc, float((v.get("duration") or {}).get("validated_hrs") or 0)) for loc, v in sps.items())
    out = []
    for code in ltdi_codes():
        out.append(Record(code, "cv_validated_hours", hours.get(code, 0.0), "hours", f"Common Voice {RELEASE}", URL,
                          method="published"))
        out.append(Record(code, "cv_spontaneous_hours", round(spont.get(code, 0.0), 2), "hours",
                          f"Common Voice Spontaneous Speech {SPS_RELEASE}", SPS_URL, method="published"))
    return out
