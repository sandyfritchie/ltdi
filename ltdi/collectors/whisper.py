"""OpenAI Whisper: languages in the model's language list (open speech recognition).

Presence only: Whisper lists many languages it transcribes poorly, so this is
the weakest form of support and scores as "open model" in the technology tiers.
"""

from __future__ import annotations

import re

from ..http import fetch_text
from ..records import Record
from . import present
from ._common import ltdi_codes

URL = "https://raw.githubusercontent.com/openai/whisper/main/whisper/tokenizer.py"


def collect() -> list[Record]:
    src = fetch_text(URL)
    block = src.split("LANGUAGES = {", 1)[1].split("}", 1)[0]
    codes = re.findall(r'"([a-z]{2,3})":', block)
    have = present(codes)
    return [Record(code, "asr_open_whisper", 1 if code in have else 0, "bool", "Whisper", URL) for code in ltdi_codes()]
