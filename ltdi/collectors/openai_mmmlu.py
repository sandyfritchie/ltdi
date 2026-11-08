"""OpenAI multilingual MMLU (MMMLU): accuracy by language for OpenAI models.

Professionally translated MMLU in 14 languages, published in
github.com/openai/simple-evals. Takes the model column with the highest
average. English isn't in the table, so this is absolute accuracy, not
relative to English.
"""

from __future__ import annotations

import re

from ..crosswalk import to_ltdi
from ..http import fetch_text
from ..records import Record

URL = "https://raw.githubusercontent.com/openai/simple-evals/main/multilingual_mmlu_benchmark_results.md"
NAMES = {"Arabic": "ar", "Bengali": "bn", "Chinese (Simplified)": "cmn", "French": "fr", "Hindi": "hi",
         "Indonesian": "id", "Japanese": "ja", "Portuguese (Brazil)": "pt", "Spanish": "es",
         "Swahili": "sw", "Yoruba": "yo"}


def collect() -> list[Record]:
    rows = [[c.strip().strip("*") for c in line.strip().strip("|").split("|")]
            for line in fetch_text(URL).splitlines() if line.startswith("|") and not re.match(r"\|\s*:?-", line)]
    header, body = rows[0], rows[1:]
    avg = next(r for r in body if r[0] == "Average")
    best = max(range(1, len(header)), key=lambda i: float(avg[i]))
    model = header[best]
    out = []
    for r in body:
        code = NAMES.get(r[0]) or to_ltdi(r[0])
        if code and r[0] in NAMES:
            out.append(Record(code, "llm_mmmlu_openai", float(r[best]), "accuracy", f"OpenAI MMMLU ({model})", URL,
                              note="Absolute accuracy; English is not in the table"))
    return out
