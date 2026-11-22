"""Count the words and documents in a Hugging Face text dataset's files, for datasets whose cards give
only document counts (MADLAD-400). Run in GitHub Actions (.github/workflows/text-words.yml); the results
go into config/madlad_words.csv. Prints one line per language:
    WORDS<TAB>dataset<TAB>label<TAB>documents<TAB>words

Words are whitespace-separated tokens, as FineWeb-2 counts them for the languages it covers.

Usage: python tools/text_words.py DATASET LABEL... [--pattern '{label}/{label}_clean_'] [--shard I/N]
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
import urllib.request

HF = "https://huggingface.co"


def files(dataset: str, folder: str, stem: str) -> list[str]:
    with urllib.request.urlopen(f"{HF}/api/datasets/{dataset}/tree/main/{folder}", timeout=120) as r:
        return sorted(x["path"] for x in json.load(r) if x["type"] == "file" and stem in x["path"])


def count(dataset: str, path: str) -> tuple[int, int]:
    docs = words = 0
    with urllib.request.urlopen(f"{HF}/datasets/{dataset}/resolve/main/{path}", timeout=600) as r, \
            gzip.open(r, "rt", encoding="utf-8") as f:
        for line in f:
            text = json.loads(line).get("text", "")
            docs += 1
            words += len(text.split())
    return docs, words


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dataset")
    ap.add_argument("labels", nargs="+")
    ap.add_argument("--folder", default="data/{label}")
    ap.add_argument("--stem", default="{label}_clean_")
    ap.add_argument("--shard", default="0/1")
    a = ap.parse_args()
    i, n = map(int, a.shard.split("/"))
    for label in a.labels[i::n]:
        try:
            d = w = 0
            for p in files(a.dataset, a.folder.format(label=label), a.stem.format(label=label)):
                dd, ww = count(a.dataset, p)
                d, w = d + dd, w + ww
            print(f"WORDS\t{a.dataset}\t{label}\t{d}\t{w}", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"failed {label}: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
