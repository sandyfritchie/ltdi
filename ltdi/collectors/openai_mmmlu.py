"""OpenAI multilingual MMLU (MMMLU): accuracy by language for OpenAI models.

Professionally translated MMLU in 14 languages, published in
github.com/openai/simple-evals. Takes the model column with the highest
average. English isn't in the table, so this is absolute accuracy, not
relative to English. English itself comes from the original MMLU score for the
same model in the simple-evals README.
"""

from __future__ import annotations

import re

from ..crosswalk import to_ltdi
from ..http import fetch_text
from ..records import Record

URL = "https://raw.githubusercontent.com/openai/simple-evals/main/multilingual_mmlu_benchmark_results.md"
README = "https://raw.githubusercontent.com/openai/simple-evals/main/README.md"  # English MMLU, same models
NAMES = {"Arabic": "ar", "Bengali": "bn", "Chinese (Simplified)": "cmn", "French": "fr", "Hindi": "hi",
         "Indonesian": "id", "Japanese": "ja", "Portuguese (Brazil)": "pt", "Spanish": "es",
         "Swahili": "sw", "Yoruba": "yo"}


def _table(text: str) -> list[list[str]]:
    return [[c.strip().strip("*") for c in line.strip().strip("|").split("|")]
            for line in text.splitlines() if line.startswith("|") and not re.match(r"\|\s*:?-", line)]


def english(model: str) -> float | None:
    """The model's MMLU score from the README's main table (rows like "o3-high [^10]")."""
    rows = _table(fetch_text(README))
    col = next((r.index("MMLU") for r in rows if "MMLU" in r), None)
    for r in rows:
        if col is not None and re.sub(r"\s*\[\^\d+\]", "", r[0]).strip() == model and r[col]:
            return float(r[col]) / 100
    return None


def collect() -> list[Record]:
    rows = _table(fetch_text(URL))
    header, body = rows[0], rows[1:]
    avg = next(r for r in body if r[0] == "Average")
    best = max(range(1, len(header)), key=lambda i: float(avg[i]))
    model = header[best]
    out = []
    for r in body:
        code = NAMES.get(r[0]) or to_ltdi(r[0])
        if code and r[0] in NAMES:
            out.append(Record(code, "llm_mmmlu_openai", float(r[best]), "accuracy", f"OpenAI MMMLU ({model})", URL,
                              note="Absolute accuracy"))
    en = english(model)
    if en is not None:
        out.append(Record("en", "llm_mmmlu_openai", round(en, 3), "accuracy", f"OpenAI MMLU ({model})", README,
                          note="English: the original MMLU, which MMMLU translates"))
    return out
