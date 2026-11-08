"""OpenAI Whisper: language list, and word error rate on FLEURS by language.

Presence: languages in the model's tokenizer language list (open speech
recognition). Whisper lists many languages it transcribes poorly, so presence
alone is the weakest form of support.

Depth: the FLEURS panel of Whisper's published language-breakdown chart, which
gives large-v3 word (or character) error rates for the 61 languages it handles
best. A language missing from that panel has no published accuracy below the
chart's cutoff (about 50%), and is recorded as such.
"""

from __future__ import annotations

import json
import re

from .. import DATA
from ..http import fetch_text
from ..records import Record
from . import present
from ._common import ltdi_codes

URL = "https://raw.githubusercontent.com/openai/whisper/main/whisper/tokenizer.py"
CHART = "https://raw.githubusercontent.com/openai/whisper/main/language-breakdown.svg"
ALIASES = {"Mandarin": "cmn"}


def fleurs_wer() -> dict[str, float]:
    """English language name -> large-v3 FLEURS WER/CER, parsed from the chart's labels."""
    labels = re.findall(r"<!-- (.{1,40}?) -->", fetch_text(CHART))
    end = labels.index("FLEURS")
    start = max(j for j in range(end) if labels[j].startswith("WER or"))
    names = [re.sub(r"[$]", "", n).replace("~", " ") for n in labels[start + 1:end]]
    values = labels[labels.index("large-v2", end) + 1:][: len(names)]
    return {n: float(v) for n, v in zip(names, values)}


def collect() -> list[Record]:
    src = fetch_text(URL)
    block = src.split("LANGUAGES = {", 1)[1].split("}", 1)[0]
    have = present(re.findall(r'"([a-z]{2,3})":', block))

    by_name = {l["name"]: l["code"] for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))}
    by_name.update(ALIASES)
    wer = {by_name[n]: v for n, v in fleurs_wer().items() if n in by_name}

    out = []
    for code in ltdi_codes():
        out.append(Record(code, "asr_open_whisper", 1 if code in have else 0, "bool", "Whisper", URL))
        if code in wer:
            out.append(Record(code, "asr_whisper_fleurs_wer", wer[code], "% WER", "Whisper large-v3 on FLEURS", CHART,
                              note="Word error rate (character error rate for Chinese, Japanese, Korean, Thai)"))
        else:
            out.append(Record(code, "asr_whisper_fleurs_wer", 100.0, "% WER", "Whisper large-v3 on FLEURS", CHART,
                              note="Not in the published breakdown, which shows languages under about 50% WER; "
                                   "recorded as 100%"))
    return out
