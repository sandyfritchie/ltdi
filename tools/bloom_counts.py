"""Count SIL's Bloom Library datasets on Hugging Face (gated: needs the HF_TOKEN secret), per language and
by licence: words of book text (sil-ai/bloom-lm) and hours of read speech aligned with text
(sil-ai/bloom-speech, each clip's length read from its audio). Run in Actions (.github/workflows/bloom.yml);
the results go into config/bloom_counts.csv. Prints lines:
    BLOOM<TAB>text|speech<TAB>language<TAB>open|restricted<TAB>books|clips<TAB>words|seconds

Open: CC0, CC BY, CC BY-SA and public domain. Restricted: non-commercial or no-derivatives licences
(bloom-speech's terms make everything but CC BY-SA non-commercial).
"""

from __future__ import annotations

import io
import json
import os
import sys
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

import soundfile as sf

HF = "https://huggingface.co/datasets"
TOKEN = os.environ.get("HF_TOKEN")


def get(url: str, auth: bool = True) -> bytes:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"} if auth and TOKEN else {})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def text_open(lic: str) -> bool:
    lic = (lic or "").lower()
    return lic in ("cc0", "cc-by", "cc-by-sa", "public domain", "pd") or (lic.startswith("cc-by") and "nc" not in lic and "nd" not in lic)


def text() -> None:
    books, words = defaultdict(int), defaultdict(int)
    for split in ("train", "val", "test"):
        data = json.loads(get(f"{HF}/sil-ai/bloom-lm/resolve/main/bloom_lm_{split}.json"))
        for lang, items in data.items():
            for it in items:
                k = (lang, "open" if text_open(it.get("license")) else "restricted")
                books[k] += 1
                words[k] += len((it.get("text") or "").split())
    for (lang, kind), n in sorted(books.items()):
        print(f"BLOOM\ttext\t{lang}\t{kind}\t{n}\t{words[(lang, kind)]}", flush=True)


def seconds(url: str) -> float:
    try:
        info = sf.info(io.BytesIO(get(url, auth=False)))
        return info.frames / info.samplerate
    except Exception as e:  # noqa: BLE001
        print(f"unreadable {url}: {e}", file=sys.stderr)
        return 0.0


def speech() -> None:
    clips = json.loads(get(f"{HF}/sil-ai/bloom-speech/resolve/main/bloom_speech.json"))
    info = json.loads(get(f"{HF}/sil-ai/bloom-speech/resolve/main/book_info.json"))
    todo = []
    for lang, items in clips.items():
        for it in items:
            lic = ((info.get(lang) or {}).get(it.get("book")) or {}).get("license", "")
            kind = "open" if lic.lower() in ("cc-by-sa", "cc0") else "restricted"
            todo.append((lang, kind, it["url"]))
    print(f"{len(todo)} clips", file=sys.stderr)
    with ThreadPoolExecutor(32) as ex:
        secs = list(ex.map(seconds, [u for _, _, u in todo]))
    n, total = defaultdict(int), defaultdict(float)
    for (lang, kind, _), s in zip(todo, secs):
        n[(lang, kind)] += 1
        total[(lang, kind)] += s
    for (lang, kind), c in sorted(n.items()):
        print(f"BLOOM\tspeech\t{lang}\t{kind}\t{c}\t{total[(lang, kind)]:.1f}", flush=True)


if __name__ == "__main__":
    print("token set:", bool(TOKEN), file=sys.stderr)
    text()
    speech()
