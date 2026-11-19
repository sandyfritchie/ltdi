"""Meta Omnilingual ASR: open speech recognition for 1,600+ languages (November 2025).

  asr_open_omnilingual       languages in Meta's per-language results table for its 7B LLM-ASR model

The table (per_language_results_table_7B_llm_asr.csv, linked from the README) also gives each language's
character error rate, but that isn't recorded: each is measured on held-out data from the language's own
training sources, for most small languages a few readers of Bible recordings, so 310 languages read
under 1% (better than English, at 3%) and the figures say more about the test data than the model.

Run:  python -m ltdi.collectors omnilingual
"""

from __future__ import annotations

import csv
import io

from ..crosswalk import to_ltdi
from ..http import fetch_text
from ..records import Record
from ._common import presence

REPO = "https://github.com/facebookresearch/omnilingual-asr"
COMMIT = "81f51e224ce9e74b02cc2a3eaf21b2d91d743455"
FILE = "per_language_results_table_7B_llm_asr.csv"
URL = f"https://raw.githubusercontent.com/facebookresearch/omnilingual-asr/{COMMIT}/{FILE}"
PAGE = f"{REPO}/blob/{COMMIT}/{FILE}"
SOURCE = "Meta Omnilingual ASR, 7B LLM-ASR (2025)"


def collect() -> list[Record]:
    langs = set()
    for r in csv.DictReader(io.StringIO(fetch_text(URL))):
        code = to_ltdi(r["Language"].split("_", 1)[0])
        if code:
            langs.add(code)
    return presence("asr_open_omnilingual", langs, SOURCE, PAGE)
