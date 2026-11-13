"""Meta Omnilingual ASR: open speech recognition for 1,600+ languages (November 2025).

  asr_open_omnilingual       languages in Meta's per-language results table for its 7B LLM-ASR model
  asr_omnilingual_cer        that table's character error rate (CER, %) for the language

The table (per_language_results_table_7B_llm_asr.csv, linked from the README) lists each language with
its training hours and CER on Meta's held-out evaluation data, which is mostly from the same sources
as its training data, so it reads better than performance on other speech would. Where a language
has results in several scripts, the one in its main script is kept, else the best.

Run:  python -m ltdi.collectors omnilingual
"""

from __future__ import annotations

import csv
import io
import json

from .. import DATA
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
NOTE = "Character error rate on Meta's evaluation data: under 10% is usually usable, over 25% hard to use"


def collect() -> list[Record]:
    scripts = {l["code"]: l["scripts"] for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))}
    best: dict[str, tuple[bool, float]] = {}  # code -> (in its main script, CER)
    for r in csv.DictReader(io.StringIO(fetch_text(URL))):
        iso, script = r["Language"].split("_", 1)
        code = to_ltdi(iso)
        if not code or not r["CER"]:
            continue
        main = (scripts.get(code) or [""])[0] == script.lower()
        key = (main, -float(r["CER"]))
        if code not in best or key > (best[code][0], -best[code][1]):
            best[code] = (main, float(r["CER"]))
    return (presence("asr_open_omnilingual", set(best), SOURCE, PAGE)
            + [Record(c, "asr_omnilingual_cer", cer, "% CER", SOURCE, PAGE, note=NOTE)
               for c, (_, cer) in sorted(best.items())])
