"""Hours of a gated Hugging Face dataset split by one of its columns (say, scripted vs unscripted), read with
range requests so only the duration and grouping columns of each parquet file are fetched.

  python tools/split_hours.py COLUMN DATASET [DATASET ...]      (needs HF_TOKEN for gated datasets)

Prints one SPLIT line per dataset and value: SPLIT <dataset> <value> <clips> <hours>."""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from pathlib import Path

import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audio_hours import HF, RangeFile, files  # noqa: E402

DURATION = ("duration", "duration_s", "duration_sec", "audio_duration")


def main() -> None:
    column, datasets = sys.argv[1], sys.argv[2:]
    token = os.environ.get("HF_TOKEN")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    for ds in datasets:
        totals: dict[str, list[float]] = defaultdict(lambda: [0, 0.0])
        for path in files(ds, ""):
            f = pq.ParquetFile(RangeFile(f"{HF}/datasets/{ds}/resolve/main/{path}", headers))
            names = f.schema_arrow.names
            dur = next((n for n in names if n.lower() in DURATION), None)
            if not dur or column not in names:
                print(f"SCHEMA {ds} {path} {names}", flush=True)
                break
            t = f.read(columns=[column, dur])
            for v, d in zip(t.column(0).to_pylist(), t.column(1).to_pylist()):
                totals[str(v)][0] += 1
                totals[str(v)][1] += d or 0
            print(f"FILE {path}", flush=True)
        for v, (n, s) in sorted(totals.items()):
            print(f"SPLIT {ds} {v} {n} {s / 3600:.2f}", flush=True)


if __name__ == "__main__":
    main()
