"""AfroBench (McGill NLP and Masakhane, ACL Findings 2025): LLM translation quality into African languages.

  llm_afrobench_gpt4o     GPT-4o (2024-08-06), FLORES-200 from English, chrF
  llm_afrobench_gemini    Gemini 1.5 Pro (002), the same

AfroBench prompted each model zero-shot with three prompts; the best prompt's score is kept for each
language. The results are CSV files in the AfroBench repository (pinned below). Scores in a script
other than the language's main one are left out, as for the translation services (mt_quality).

Run:  python -m ltdi.collectors afrobench
"""

from __future__ import annotations

import csv
import io
import urllib.parse

from ..http import fetch_text
from ..records import Record
from .mt_quality import _scores

REPO = "https://github.com/McGill-NLP/AfroBench"
COMMIT = "78aaa6e9794cf0a009be7ff451e5e204eb16bdd7"
FILE = "results/flores - en_xx 0-shot.csv"
URL = f"https://raw.githubusercontent.com/McGill-NLP/AfroBench/{COMMIT}/{urllib.parse.quote(FILE)}"
PAGE = f"{REPO}/blob/{COMMIT}/{urllib.parse.quote(FILE)}"
MODELS = {"gpt-4o-2024-08-06": ("llm_afrobench_gpt4o", "GPT-4o (2024-08)"),
          "gemini-1.5-pro-002": ("llm_afrobench_gemini", "Gemini 1.5 Pro")}
NOTE = ("Translation from English on FLORES-200 (chrF, best of three prompts): about 50 or more reads "
        "well, under 30 is often hard to use")


def collect() -> list[Record]:
    best: dict[str, dict[str, float]] = {}
    for r in csv.DictReader(io.StringIO(fetch_text(URL))):
        if r["model"] not in MODELS:
            continue
        scores = best.setdefault(r["model"], {})
        for col, v in r.items():
            if "_" in col and col != "avg_score" and v:
                scores[col] = max(float(v), scores.get(col, 0.0))
    out = []
    for model, (indicator, name) in MODELS.items():
        for code, v in sorted(_scores(best.get(model, {}).items()).items()):
            out.append(Record(code, indicator, v, "chrF", f"AfroBench: {name} (2025)", PAGE, note=NOTE))
    return out
