"""Evaluation coverage: which public benchmarks include each language.

  bench_<name>      1 if the benchmark covers the language
  eval_benchmarks   how many of the benchmarks below cover it

Benchmarks (language lists from each dataset's Hugging Face card, or from records
other collectors write):
  FLORES-200 (translation), Belebele (reading comprehension), FLEURS (speech recognition),
  Global-MMLU, MMMLU and INCLUDE (knowledge and reasoning), XNLI (inference),
  MGSM (maths), IrokoBench (AfriXNLI and AfriMMLU, African languages)

Run:  python -m ltdi.collectors benchmarks   (needs huggingface.co; run flores200, belebele, speech first)
"""

from __future__ import annotations

import json
import re

from .. import DATA
from ..http import fetch_json
from ..records import Record, read_records
from . import present
from ._common import ltdi_codes

API = "https://huggingface.co/api/datasets/{}"
HF = {
    "global_mmlu": ("Global-MMLU", "CohereLabs/Global-MMLU"),
    "mmmlu": ("MMMLU", "openai/MMMLU"),
    "include": ("INCLUDE", "CohereLabs/include-base-44"),
    "xnli": ("XNLI", "facebook/xnli"),
    "mgsm": ("MGSM", "juletxara/mgsm"),
    "irokobench": ("IrokoBench", "masakhane/afrixnli"),
}
FROM_RECORDS = {"flores200": ("FLORES-200", "flores200"), "belebele": ("Belebele", "belebele"),
                "fleurs": ("FLEURS", "speech_fleurs")}
ORIGINAL_ENGLISH = {"mmmlu", "include"}  # translated from (or alongside) English originals


def configs(repo: str) -> list[str]:
    card = fetch_json(API.format(repo)).get("cardData") or {}
    return [c["config_name"] for c in card.get("configs") or [] if c.get("config_name")]


def by_name() -> dict[str, str]:
    langs = json.loads((DATA / "languages.json").read_text(encoding="utf-8"))
    names = {l["name"]: l["code"] for l in langs}
    names.update({"Chinese": "cmn", "Bangla": "bn"})
    return names


def collect() -> list[Record]:
    codes = ltdi_codes()
    covered: dict[str, set[str]] = {}
    names = by_name()
    for key, (_, repo) in HF.items():
        cfg = configs(repo)
        labels = {re.split(r"[_.]", c)[0].lower() for c in cfg}
        found = present(labels) | {names[c] for c in cfg if c in names}
        covered[key] = found | ({"en"} if key in ORIGINAL_ENGLISH else set())
    current = {}
    for f in (DATA / "records").glob("*.csv"):
        for r in read_records(f):
            current[(r.language, r.indicator)] = r.value
    for key, (_, ind) in FROM_RECORDS.items():
        covered[key] = {c for c in codes if current.get((c, ind))}

    labels = {**{k: v[0] for k, v in HF.items()}, **{k: v[0] for k, v in FROM_RECORDS.items()}}
    out = []
    for code in codes:
        have = [k for k in labels if code in covered[k]]
        for k in labels:
            url = f"https://huggingface.co/datasets/{HF[k][1]}" if k in HF else ""
            out.append(Record(code, f"bench_{k}", int(code in covered[k]), "bool", labels[k], url))
        out.append(Record(code, "eval_benchmarks", len(have), f"benchmarks of {len(labels)}", "Public benchmarks",
                          "https://github.com/sandyfritchie/ltdi/blob/main/ltdi/collectors/benchmarks.py",
                          note=", ".join(labels[k] for k in have) or "None"))
    return out
