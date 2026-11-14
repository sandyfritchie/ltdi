"""OpenAI multilingual MMLU (MMMLU): accuracy by language for OpenAI models.

Professionally translated MMLU in 14 languages, published in
github.com/openai/simple-evals. Takes the model column with the highest
average. English isn't in the table, so this is absolute accuracy, not
relative to English. English itself comes from the original MMLU score for the
same model in the simple-evals README.
"""

from __future__ import annotations

import re

from ..http import fetch_text
from ..records import Record

URL = "https://raw.githubusercontent.com/openai/simple-evals/main/multilingual_mmlu_benchmark_results.md"
README = "https://raw.githubusercontent.com/openai/simple-evals/main/README.md"  # English MMLU, same models
NAMES = {"Arabic": "ar", "Bengali": "bn", "Chinese (Simplified)": "cmn", "French": "fr", "German": "de",
         "Hindi": "hi", "Indonesian": "id", "Italian": "it", "Japanese": "ja", "Korean": "ko",
         "Portuguese (Brazil)": "pt", "Spanish": "es", "Swahili": "sw", "Yoruba": "yo"}
SKIP = {"Average"}  # table rows that aren't languages


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


def parse(text: str) -> tuple[str, list[Record]]:
    """(best model, a record per language) from the results table. A row that's neither a mapped
    language nor in SKIP is an error, so a language added to the table can't be dropped silently."""
    rows = _table(text)
    header, body = rows[0], rows[1:]
    avg = next(r for r in body if r[0] == "Average")
    best = max(range(1, len(header)), key=lambda i: float(avg[i]))
    model = header[best]
    unknown = [r[0] for r in body if r[0] not in NAMES and r[0] not in SKIP]
    if unknown:
        raise ValueError(f"MMMLU table rows not mapped to a language: {unknown}; add them to NAMES or SKIP")
    out = [Record(NAMES[r[0]], "llm_mmmlu_openai", float(r[best]), "accuracy", f"OpenAI MMMLU ({model})", URL,
                  note="Absolute accuracy")
           for r in body if r[0] in NAMES]
    return model, out


def collect() -> list[Record]:
    model, out = parse(fetch_text(URL))
    en = english(model)
    if en is not None:
        out.append(Record("en", "llm_mmmlu_openai", round(en, 3), "accuracy", f"OpenAI MMLU ({model})", README,
                          note="English: the original MMLU, which MMMLU translates"))
    return out
