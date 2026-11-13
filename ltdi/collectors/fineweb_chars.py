"""Character inventories from real text: which letters each language's FineWeb-2 text uses.

For about 6,300 languages no character set is documented (in Hyperglot or Unicode CLDR), so nothing
says which letters a font or keyboard must have. FineWeb-2 has text for about 1,800 language-script
subsets. This reads a random sample of each subset's documents (whole files for small subsets, random
row groups of random files for large ones, over HTTP range requests) and records:

  letters           letters and marks used: in at least 3 sampled documents (2 if fewer than 20 were
                    sampled) and at least 1 in 20,000 of the sample's letters, so stray names and
                    typos drop out
  private_use       share of characters in Unicode's private use areas (legacy fonts that put
                    letters on code points of their own; text that only displays with that font)
  replacement       share of U+FFFD, the mark of text decoded with the wrong encoding
  scripts           the scripts of the sample's letters, with their shares

Runs on GitHub Actions (fineweb-chars.yml), since huggingface.co's file storage isn't reachable from
every network:  python -m ltdi.collectors.fineweb_chars --shard 0/8
Writes data/fineweb_chars.csv, which the font check (fonts.py) uses for languages with no documented
character set.
"""

from __future__ import annotations

import argparse
import csv
import io
import random
import sys
import time
import unicodedata
from collections import Counter
from pathlib import Path

from .. import DATA
from ..crosswalk import to_ltdi
from ..http import fetch_text
from .fineweb2 import URL as DISTRIBUTION

REPO = "HuggingFaceFW/fineweb-2"
REVISION = "af9c13333eb981300149d5ca60a8e9d659b276b9"
OUT = DATA / "fineweb_chars.csv"
DOCS = 400            # documents sampled per subset
MAX_WORDS = 5e8       # larger subsets are well documented and slow to sample
MIN_SHARE = 1 / 20000
FIELDS = ["language", "subset", "words", "docs_sampled", "chars_sampled", "letters", "private_use",
          "replacement", "scripts", "retrieved"]


def subsets(max_words: float) -> list[dict]:
    rows = csv.DictReader(io.StringIO(fetch_text(DISTRIBUTION)))
    return sorted((r for r in rows if r["split"] == "train" and not r["subset"].endswith("_removed")
                   and r["words"] not in ("", "-") and float(r["words"]) <= max_words
                   and to_ltdi(r["code"])), key=lambda r: r["subset"])


def _retry(fn, *a, **k):
    for attempt in range(7):
        try:
            return fn(*a, **k)
        except Exception as e:  # rate limits and dropped connections: wait and try again
            if attempt == 6:
                raise
            wait = 60 if "429" in str(e) else 5 * 2 ** attempt
            print(f"    retrying in {wait}s: {str(e)[:120]}", flush=True)
            time.sleep(wait)


def sample(fs, subset: str, rng: random.Random) -> list[str]:
    """Up to DOCS random documents of a subset's train split."""
    import pyarrow.parquet as pq
    base = f"datasets/{REPO}@{REVISION}/data/{subset}/train"
    files = sorted(_retry(fs.ls, base, detail=False))
    docs: list[str] = []
    for path in rng.sample(files, min(3, len(files))):
        with _retry(fs.open, path, "rb", block_size=4 * 1024 * 1024) as fh:
            pf = pq.ParquetFile(fh)
            groups = list(range(pf.num_row_groups))
            for g in rng.sample(groups, min(2, len(groups))):
                docs += _retry(pf.read_row_group, g, columns=["text"]).column("text").to_pylist()
        if len(docs) >= 4 * DOCS:
            break
    return rng.sample(docs, min(DOCS, len(docs)))


def inventory(docs: list[str]) -> dict:
    from fontTools import unicodedata as fud
    counts, in_docs = Counter(), Counter()
    for d in docs:
        d = unicodedata.normalize("NFC", d)
        c = Counter(d)
        counts.update(c)
        in_docs.update(c.keys())
    total = sum(counts.values()) or 1
    letters = {ch: n for ch, n in counts.items() if unicodedata.category(ch)[0] in "LM"}
    n_letters = sum(letters.values()) or 1
    min_docs = 3 if len(docs) >= 20 else 2
    keep = sorted(ch for ch, n in letters.items() if n / n_letters >= MIN_SHARE and in_docs[ch] >= min_docs)
    scripts = Counter()
    for ch, n in letters.items():
        scripts[fud.script(ch)] += n
    return {
        "letters": "".join(keep),
        "private_use": round(sum(n for ch, n in counts.items() if unicodedata.category(ch) == "Co") / total, 5),
        "replacement": round(counts.get("�", 0) / total, 5),
        "scripts": " ".join(f"{s}:{n / n_letters:.3f}" for s, n in scripts.most_common(4)),
        "chars_sampled": total,
    }


def write(rows: list[dict], path: Path):
    keep = []
    if path.exists():
        with path.open(encoding="utf-8") as f:
            done = {r["subset"] for r in rows}
            keep = [r for r in csv.DictReader(f) if r["subset"] not in done]
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, FIELDS)
        w.writeheader()
        w.writerows(sorted(keep + rows, key=lambda r: r["subset"]))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("subsets", nargs="*", help="FineWeb-2 subsets (e.g. hau_Latn); none: all")
    ap.add_argument("--shard", default="0/1")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--merge", nargs="+", type=Path)
    args = ap.parse_args(argv)
    if args.merge:
        rows = [r for p in args.merge for r in csv.DictReader(p.open(encoding="utf-8"))]
        write(rows, args.out)
        print(f"merged {len(rows)} subsets into {args.out}")
        return
    from huggingface_hub import HfFileSystem
    fs = HfFileSystem()
    todo = [r for r in subsets(MAX_WORDS) if not args.subsets or r["subset"] in args.subsets]
    i, n = map(int, args.shard.split("/"))
    todo = todo[i::n]
    print(f"{len(todo)} subsets in shard {i}/{n}", flush=True)
    out = []
    for r in todo:
        try:
            docs = sample(fs, r["subset"], random.Random(r["subset"]))
            inv = inventory(docs)
            out.append({"language": to_ltdi(r["code"]), "subset": r["subset"], "words": r["words"],
                        "docs_sampled": len(docs), "retrieved": time.strftime("%Y-%m-%d"), **inv})
            print(f"  {r['subset']}: {len(docs)} docs, {len(inv['letters'])} letters, "
                  f"private use {inv['private_use']:.2%}, {inv['scripts']}", flush=True)
        except Exception as e:  # one unreadable subset shouldn't lose the rest
            print(f"  {r['subset']}: failed: {str(e)[:200]}", flush=True)
    write(out, args.out)
    print(f"wrote {args.out} ({len(out)} subsets)")


if __name__ == "__main__":
    sys.exit(main())
