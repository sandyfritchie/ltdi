"""Speech datasets available only under a data licence or for a fee: listed, never counted.

Three sources: data/licensed_speech.csv (the Mozilla Data Collective's, written by collectors/mdc.py),
config/licensed_speech.csv (corpora from other distributors, curated by hand) and config/ldc_speech.csv (the
Linguistic Data Consortium's, read by tools/ldc_speech.py)."""

from __future__ import annotations

import csv

from . import CONFIG, DATA

FIELDS = ("name", "steward", "task", "hours", "licence", "paid", "url", "distributor")


def rows() -> list[dict[str, str]]:
    out = []
    for path, default in ((DATA / "licensed_speech.csv", "the Mozilla Data Collective"), (CONFIG / "licensed_speech.csv", ""),
                          (CONFIG / "ldc_speech.csv", "the Linguistic Data Consortium")):
        if not path.exists():
            continue
        with path.open(encoding="utf-8") as f:
            for r in csv.DictReader(l for l in f if not l.startswith("#")):
                r = dict(r)
                r["distributor"] = r.get("distributor") or default
                r["id"] = r.get("id") or "mdc_" + r["url"].rstrip("/").split("/")[-1]
                out.append(r)
    return out
