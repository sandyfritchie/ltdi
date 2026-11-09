"""Open transcribed speech, summed across datasets.

Automated:
  WAXAL      Google's African speech corpus: hours per language from its split metadata
  YODAS2     YouTube videos with manually uploaded subtitles (CC licences): hours from
             its per-shard duration files (large languages are sampled)
  FLEURS     about 12 hours for each of its 102 languages (language list from its card)
Curated (config/speech_datasets.csv, from each dataset's paper or card):
  Shrutilipi, Kathbath, IndicVoices, Vaani, NaijaVoices, Multilingual LibriSpeech

Writes one record per dataset (speech_<dataset>) and open_speech_hours, the total
including Common Voice (data/records/common_voice.csv; run common_voice first).

Run:  python -m ltdi.collectors speech   (needs huggingface.co)
"""

from __future__ import annotations

import csv
import re

from .. import CONFIG, DATA
from ..http import fetch_text
from ..records import Record, read_records
from . import present
from ._common import ltdi_codes

HF = "https://huggingface.co/datasets"
WAXAL = f"{HF}/google/WaxalNLP/resolve/main/data/ASR_v2/metadata/split_comparison.csv"
YODAS_META = f"{HF}/espnet/yodas2/raw/main/meta.py"
YODAS_DUR = f"{HF}/espnet/yodas2/resolve/main/data/{{subset}}/duration/{{shard:08d}}.txt"
FLEURS = f"{HF}/google/fleurs/raw/main/README.md"
FLEURS_HOURS = 12
SAMPLE = 40  # duration files read per YODAS language at most; the rest is extrapolated


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def waxal() -> dict[str, float]:
    hours: dict[str, float] = {}
    for r in csv.DictReader(fetch_text(WAXAL).splitlines()):
        if r["version"] == "v1":
            code = next(iter(present({r["language"]})), None)
            if code:
                hours[code] = hours.get(code, 0) + float(r["hours"])
    return hours


def yodas(codes: set[str]) -> dict[str, float]:
    """Hours of video with manual subtitles: subsets ending 0xx (1xx are automatic captions)."""
    shards = dict(re.findall(r"'(\w+)':\s*(\d+)", fetch_text(YODAS_META)))
    hours: dict[str, float] = {}
    for subset, n in shards.items():
        if not re.fullmatch(r"[a-z]{2,3}0\d\d", subset):
            continue
        code = next(iter(present({subset[:-3]})), None)
        if code not in codes:
            continue
        n = int(n)
        picks = sorted({round(i * (n - 1) / max(1, SAMPLE - 1)) for i in range(min(n, SAMPLE))})
        secs = 0.0
        for i in picks:
            try:
                text = fetch_text(YODAS_DUR.format(subset=subset, shard=i))
            except Exception:
                continue
            secs += sum(float(line.split()[-1]) for line in text.splitlines() if line.strip())
        hours[code] = hours.get(code, 0) + secs / 3600 * n / len(picks)
    return hours


def fleurs() -> set[str]:
    card = fetch_text(FLEURS)
    return present(set(re.findall(r"\b([a-z]{2,3})_(?:[a-z]{4}_)?(?:[a-z]{2}|\d{3})\b", card)))


def collect() -> list[Record]:
    codes = set(ltdi_codes())
    per: dict[str, dict[str, tuple[float, str, str, str]]] = {c: {} for c in codes}  # code -> dataset -> (hours, src, url, note)
    for code, h in waxal().items():
        if code in codes:
            per[code]["WAXAL"] = (h, "WAXAL (Google and African universities)", f"{HF}/google/WaxalNLP", "Natural speech, CC BY / CC BY-SA")
    for code, h in yodas(codes).items():
        per[code]["YODAS"] = (h, "YODAS2", f"{HF}/espnet/yodas2", "Video hours with manually uploaded subtitles; CC BY 3.0")
    for code in fleurs() & codes:
        per[code]["FLEURS"] = (FLEURS_HOURS, "FLEURS", f"{HF}/google/fleurs", "About 12 hours per language; CC BY 4.0")
    with (CONFIG / "speech_datasets.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["language"] in codes:
                per[r["language"]][r["dataset"]] = (float(r["hours"]), r["dataset"], r["url"], f"{r['note']}; {r['licence']}")
    cv = {r.language: r.value for r in read_records(DATA / "records" / "common_voice.csv")
          if r.indicator == "cv_validated_hours"} if (DATA / "records" / "common_voice.csv").exists() else {}

    out = []
    datasets = sorted({d for p in per.values() for d in p})
    for code in sorted(codes):
        for d in datasets:
            h, src, url, note = per[code].get(d, (0, d, "", ""))
            out.append(Record(code, f"speech_{_slug(d)}", round(h, 1), "hours", src, url, note=note))
        parts = {**{d: v[0] for d, v in per[code].items()}, "Common Voice": cv.get(code, 0)}
        total = sum(parts.values())
        breakdown = ", ".join(f"{d} {h:,.0f}" for d, h in sorted(parts.items(), key=lambda x: -x[1]) if h >= 0.5)
        out.append(Record(code, "open_speech_hours", round(total, 1), "hours", "Open speech datasets",
                          "https://github.com/sandyfritchie/ltdi/blob/main/config/speech_datasets.csv",
                          note=breakdown or "None found"))
    return out
