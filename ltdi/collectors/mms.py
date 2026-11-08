"""Meta MMS (Massively Multilingual Speech): open speech recognition and text-to-speech.

  asr_open_mms  languages of the MMS-1B-all speech recognition model (about 1,160)
  tts_open_mms  languages with an MMS text-to-speech model (about 1,100)

The lists are linked from the MMS README in the fairseq repo and hosted on
dl.fbaipublicfiles.com, which needs to be on the network allowlist.

Run:  python -m ltdi.collectors mms
"""

from __future__ import annotations

import re

from ..records import Record
from ..http import fetch_text
from . import present
from ._common import ltdi_codes

ASR = "https://dl.fbaipublicfiles.com/mms/asr/mms1b_all_langs.html"
TTS = "https://dl.fbaipublicfiles.com/mms/tts/all-tts-languages.html"


def codes(url: str) -> set[str]:
    """ISO 639-3 codes from one of the MMS language pages ("<p> abi &emsp; Abidji </p>")."""
    html = fetch_text(url)
    return present({c.split("-")[0] for c in re.findall(r"<p>\s*([a-z]{3}(?:-script_[a-z]+)?)\s*&emsp;", html)})


def collect() -> list[Record]:
    asr, tts = codes(ASR), codes(TTS)
    out = []
    for code in ltdi_codes():
        out.append(Record(code, "asr_open_mms", 1 if code in asr else 0, "bool", "Meta MMS-1B-all", ASR))
        out.append(Record(code, "tts_open_mms", 1 if code in tts else 0, "bool", "Meta MMS-TTS", TTS))
    return out
