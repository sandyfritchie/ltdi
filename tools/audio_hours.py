"""Measure how many hours of audio a Hugging Face dataset holds, file by file, for datasets whose cards
don't say per language (Meta's Omnilingual ASR Corpus, WAXAL's TTS recordings). Run in GitHub Actions
(.github/workflows/audio-hours.yml), which can download the files; the results go into
config/speech_datasets.csv.

Reads each parquet file's audio column and takes each clip's length from its header (FLAC, WAV, OGG,
MP3), or a duration column where the dataset has one. Prints one line per file:
    HOURS<TAB>dataset<TAB>path<TAB>clips<TAB>seconds

Archives (OpenSLR's .zip and .tar.* downloads) are measured member by member:
    HOURS<TAB>url<TAB><archive><TAB>clips<TAB>seconds

Usage: python tools/audio_hours.py DATASET PATH_PREFIX [--shard I/N]
       python tools/audio_hours.py --urls URL... [--shard I/N]
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import tarfile
import tempfile
import urllib.request
import zipfile

import pyarrow.parquet as pq
import soundfile as sf

HF = "https://huggingface.co"


def files(dataset: str, prefix: str) -> list[str]:
    out, url = [], f"{HF}/api/datasets/{dataset}/tree/main/{prefix}?recursive=1"
    while url:
        with urllib.request.urlopen(url, timeout=120) as r:
            out += [x["path"] for x in json.load(r) if x["type"] == "file" and x["path"].endswith(".parquet")]
            link = r.headers.get("Link") or ""
        url = link.split(";")[0].strip("<> ") if 'rel="next"' in link else None
    return sorted(out)


def seconds(path: str) -> tuple[int, float]:
    f = pq.ParquetFile(path)
    names = f.schema_arrow.names
    dur = next((n for n in names if n.lower() in ("duration", "duration_s", "duration_sec", "audio_duration")), None)
    if dur:
        col = f.read(columns=[dur]).column(0).to_pylist()
        return len(col), float(sum(x or 0 for x in col))
    audio = next(n for n in names if n.lower() in ("audio", "speech", "wav", "flac"))
    n, total = 0, 0.0
    for batch in f.iter_batches(columns=[audio], batch_size=64):
        for v in batch.column(0).to_pylist():
            data = v.get("bytes") if isinstance(v, dict) else v
            n += 1
            if not data:
                continue
            try:
                info = sf.info(io.BytesIO(data))
                total += info.frames / info.samplerate
            except Exception as e:  # noqa: BLE001
                print(f"unreadable clip in {path}: {e}", file=sys.stderr)
    return n, total


AUDIO = (".wav", ".flac", ".ogg", ".mp3", ".opus")
UA = {"User-Agent": "ltdi-collector/0.1 (+https://github.com/sandyfritchie/ltdi)"}


def clip_seconds(data: bytes, name: str) -> float:
    try:
        info = sf.info(io.BytesIO(data))
        return info.frames / info.samplerate
    except Exception as e:  # noqa: BLE001
        print(f"unreadable clip {name}: {e}", file=sys.stderr)
        return 0.0


def archive_seconds(url: str) -> tuple[int, float]:
    n, total = 0, 0.0
    req = urllib.request.Request(url, headers=UA)
    if url.endswith(".zip"):
        with tempfile.NamedTemporaryFile(suffix=".zip") as tmp:
            with urllib.request.urlopen(req, timeout=600) as r:
                while chunk := r.read(1 << 22):
                    tmp.write(chunk)
            tmp.flush()
            with zipfile.ZipFile(tmp.name) as z:
                for m in z.infolist():
                    if m.filename.lower().endswith(AUDIO):
                        n += 1
                        total += clip_seconds(z.read(m), m.filename)
        return n, total
    with urllib.request.urlopen(req, timeout=600) as r, tarfile.open(fileobj=r, mode="r|*") as t:
        for m in t:
            if m.isfile() and m.name.lower().endswith(AUDIO):
                n += 1
                total += clip_seconds(t.extractfile(m).read(), m.name)
    return n, total


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dataset", nargs="?")
    ap.add_argument("prefix", nargs="?")
    ap.add_argument("--urls", nargs="*")
    ap.add_argument("--shard", default="0/1")
    a = ap.parse_args()
    i, n = map(int, a.shard.split("/"))
    if a.urls:
        for u in [u for u in a.urls if u][i::n]:
            try:
                clips, secs = archive_seconds(u)
            except Exception as e:  # noqa: BLE001
                print(f"failed {u}: {e}", file=sys.stderr)
                continue
            print(f"HOURS\t{u}\t{u.rsplit('/', 1)[1]}\t{clips}\t{secs:.1f}", flush=True)
        return
    todo = files(a.dataset, a.prefix)[i::n]
    print(f"{len(todo)} files in shard {a.shard}", file=sys.stderr)
    token = os.environ.get("HF_TOKEN")
    for p in todo:
        with tempfile.NamedTemporaryFile(suffix=".parquet") as tmp:
            req = urllib.request.Request(f"{HF}/datasets/{a.dataset}/resolve/main/{p}",
                                         headers={"Authorization": f"Bearer {token}"} if token else {})
            with urllib.request.urlopen(req, timeout=600) as r:
                while chunk := r.read(1 << 22):
                    tmp.write(chunk)
            tmp.flush()
            clips, secs = seconds(tmp.name)
        print(f"HOURS\t{a.dataset}\t{p}\t{clips}\t{secs:.1f}", flush=True)


if __name__ == "__main__":
    main()
