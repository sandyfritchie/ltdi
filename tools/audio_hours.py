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
import time
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


class RangeFile(io.RawIOBase):
    """A remote file read with HTTP range requests, so pyarrow fetches only the footer and the columns it
    needs: IndicVoices' duration column is a few kilobytes of each multi-gigabyte file."""

    def __init__(self, url: str, headers: dict):
        req = urllib.request.Request(url, headers={**UA, **headers, "Range": "bytes=0-0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            self.url = r.geturl()  # the signed download address the Hub redirects to
            self.size = int(r.headers["Content-Range"].split("/")[1])
        self.pos = 0

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        return self.pos

    def read(self, n=-1):
        end = self.size if n is None or n < 0 else min(self.size, self.pos + n)
        if end <= self.pos:
            return b""
        for attempt in range(4):
            try:
                req = urllib.request.Request(self.url, headers={**UA, "Range": f"bytes={self.pos}-{end - 1}"})
                with urllib.request.urlopen(req, timeout=300) as r:
                    data = r.read()
                break
            except Exception:  # noqa: BLE001
                if attempt == 3:
                    raise
                time.sleep(5 * (attempt + 1))
        self.pos += len(data)
        return data

    def readinto(self, b):
        data = self.read(len(b))
        b[:len(data)] = data
        return len(data)


def seconds(path) -> tuple[int, float]:
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
    ap.add_argument("--ranged", action="store_true", help="read only a duration column, with range requests")
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
        if a.ranged:  # only the duration column is read, over HTTP
            for attempt in range(3):
                try:
                    f = RangeFile(f"{HF}/datasets/{a.dataset}/resolve/main/{p}", {"Authorization": f"Bearer {token}"} if token else {})
                    clips, secs = seconds(f)
                    break
                except Exception as e:  # noqa: BLE001
                    print(f"retrying {p}: {e}", file=sys.stderr)
                    time.sleep(20)
            else:
                print(f"failed {p}", file=sys.stderr)
                continue
            print(f"HOURS\t{a.dataset}\t{p}\t{clips}\t{secs:.1f}", flush=True)
            continue
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
