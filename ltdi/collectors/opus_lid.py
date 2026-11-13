"""Language check of OPUS's web-mined parallel corpora (Kreutzer et al. 2022).

Kreutzer et al., "Quality at a Glance: An Audit of Web-Crawled Multilingual Datasets" (TACL 2022),
found that web-mined corpora for low-resource languages are often largely in another language or in
no language at all. This repeats the cheapest part of their audit automatically: for each web-mined
corpus OPUS holds for a language paired with English, take a random sample of lines from the
non-English side and identify their language with GlotLID (an open language identifier).

Each corpus is a zip on OPUS's object storage holding one text file per language. Only the
non-English file is read, streamed once from start to end over HTTP range requests (nothing is
stored), keeping a uniform random sample as it goes (reservoir sampling), so the sample doesn't
depend on how the file is ordered.

It checks the language only: a line in the right language can still be a poor translation of its
English pair, which this can't see.

Run (needs object.pouta.csc.fi and huggingface.co, so it runs on GitHub Actions: opus-lid.yml):
  python -m ltdi.collectors.opus_lid ig ny gn jv fon [--sample 2000]
  python -m ltdi.collectors.opus_lid --shard 0/8      (every language, corpora up to 20M pairs)
Writes data/opus_lid.csv, which the OPUS collector (opus.py) uses to count each checked web-mined
corpus at the share of its lines in the language.
"""

from __future__ import annotations

import argparse
import collections
import csv
import io
import os
import random
import sys
import time
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

from .. import CACHE, DATA
from ..crosswalk import to_ltdi
from ..http import USER_AGENT, fetch_json
from .opus import API, LANGUAGES, MINED

MODEL_REPO = "https://huggingface.co/cis-lmu/glotlid"
MODEL_REV = "e9592e0a9bc3b6f2a946de94faaa188d1dd6f522"
MODEL_FILE = "model_v3.bin"  # GlotLID v3, the version credited under language identification
MODEL_URL = f"{MODEL_REPO}/resolve/{MODEL_REV}/{MODEL_FILE}"
OUT = DATA / "opus_lid.csv"
CHUNK = 16 * 1024 * 1024
EXAMPLES = 8  # lines in another language printed per corpus, to see what they are
MIN_WORDS, MIN_CHARS = 3, 15  # lines with fewer words and characters are too short to identify; counted apart
FIELDS = ["language", "opus_label", "corpus", "pairs", "size_mb", "lines_read", "sampled", "in_language",
          "other_language", "too_short", "top_labels", "url", "retrieved"]


class RangeFile(io.RawIOBase):
    """A remote file read with HTTP range requests, so zipfile can seek in it."""

    def __init__(self, url: str):
        self.url, self.pos = url, 0
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as r:
            self.size = int(r.headers["Content-Length"])
        self.fetched = 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        self.pos = {0: offset, 1: self.pos + offset, 2: self.size + offset}[whence]
        return self.pos

    def readinto(self, b):
        if self.pos >= self.size:
            return 0
        end = min(self.pos + len(b), self.size) - 1
        req = urllib.request.Request(self.url, headers={"User-Agent": USER_AGENT,
                                                         "Range": f"bytes={self.pos}-{end}"})
        for attempt in range(6):
            try:
                with urllib.request.urlopen(req, timeout=300) as r:
                    data = r.read()
                break
            except OSError:
                if attempt == 5:
                    raise
                time.sleep(5 * 2 ** attempt)
        n = len(data)
        b[:n] = data
        self.pos += n
        self.fetched += n
        return n


def sample_lines(url: str, label: str, k: int, seed: str) -> tuple[list[str], int, int]:
    """(a uniform random sample of k lines from the zip's file for `label`, lines read, bytes fetched)"""
    raw = RangeFile(url)
    with zipfile.ZipFile(io.BufferedReader(raw, buffer_size=CHUNK)) as z:
        names = [n for n in z.namelist() if n.endswith("." + label)]
        if len(names) != 1:
            raise ValueError(f"{url}: no single file for {label} in {z.namelist()}")
        rng, keep, n = random.Random(seed), [], 0
        with z.open(names[0]) as f:
            for line in io.TextIOWrapper(f, encoding="utf-8", errors="replace"):
                n += 1
                if len(keep) < k:
                    keep.append(line)
                else:
                    j = rng.randrange(n)
                    if j < k:
                        keep[j] = line
    return [l.strip() for l in keep], n, raw.fetched


def short(line: str) -> bool:
    """Too short to identify: under 3 words and under 15 characters (the second for scripts written
    without spaces, such as Chinese or Thai)."""
    return len(line.split()) < MIN_WORDS and len(line) < MIN_CHARS


def model():
    import fasttext  # installed on the runner only (fasttext-wheel)
    path = CACHE / "glotlid" / f"{MODEL_REV[:12]}-{MODEL_FILE}"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        req = urllib.request.Request(MODEL_URL, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=600) as r, tmp.open("wb") as f:
            while chunk := r.read(CHUNK):
                f.write(chunk)
        tmp.rename(path)
    return fasttext.load_model(str(path))


def mined_corpora(label: str) -> list[dict]:
    a, b = sorted(["en", label])
    out = {}
    for c in fetch_json(API.format(a=a, b=b), cache=False).get("corpora", []):
        if c.get("corpus") in MINED and isinstance(c.get("alignment_pairs"), int) and c.get("url"):
            out[c["corpus"]] = c  # one entry per corpus: the latest version
    return sorted(out.values(), key=lambda c: c["corpus"])


def check(lid, label: str, corpus: dict, k: int) -> dict:
    code = to_ltdi(label.replace("_", "-"))
    t = time.time()
    lines, n, fetched = sample_lines(corpus["url"], label, k, f"{label}/{corpus['corpus']}")
    long = [l for l in lines if not short(l)]
    labels, _ = lid.predict(long, k=1) if long else ([], [])
    found = collections.Counter(l[0].removeprefix("__label__") for l in labels)
    ours = sum(v for lab, v in found.items() if to_ltdi(lab.split("_")[0]) == code)
    total = len(lines) or 1
    print(f"  {corpus['corpus']}: read {n:,} lines ({fetched / 1e6:,.0f} MB) in {time.time() - t:,.0f}s; "
          f"{ours / total:.0%} in the language, {(len(lines) - len(long)) / total:.0%} too short; "
          + ", ".join(f"{lab} {v / total:.0%}" for lab, v in found.most_common(6)), flush=True)
    rng = random.Random(corpus["corpus"])
    others = [(lab[0].removeprefix("__label__"), l) for lab, l in zip(labels, long)
              if to_ltdi(lab[0].removeprefix("__label__").split("_")[0]) != code]
    for lab, l in rng.sample(others, min(EXAMPLES, len(others))):
        print(f"      {lab}: {l[:110]}", flush=True)
    shorts = [l for l in lines if short(l)]
    for l in rng.sample(shorts, min(3, len(shorts))):
        print(f"      (short): {l[:110]}", flush=True)
    return {
        "language": code, "opus_label": label, "corpus": corpus["corpus"], "pairs": corpus["alignment_pairs"],
        "size_mb": round(int(corpus.get("size") or 0) / 1024), "lines_read": n, "sampled": len(lines),
        "in_language": round(ours / total, 3), "other_language": round((len(long) - ours) / total, 3),
        "too_short": round((len(lines) - len(long)) / total, 3),
        "top_labels": "; ".join(f"{lab} {v / total:.0%}" for lab, v in found.most_common(6)),
        "url": corpus["url"], "retrieved": date.today().isoformat(),
    }


def plan(labels: list[str] | None, max_pairs: int) -> list[tuple[str, dict]]:
    """(label, corpus) for every web-mined corpus to check: of the given labels, or of every OPUS label
    that resolves to an LTDI language, up to max_pairs sentence pairs."""
    if not labels:
        labels = sorted(l for l in fetch_json(LANGUAGES, cache=False)["languages"]
                        if to_ltdi(l.replace("_", "-")) not in (None, "en"))
    with ThreadPoolExecutor(8) as pool:
        found = pool.map(mined_corpora, labels)
    return [(l, c) for l, cs in zip(labels, found) for c in cs if c["alignment_pairs"] <= max_pairs]


def shard(todo: list, i: int, n: int) -> list:
    """The i-th of n shards, balanced by file size (largest first, each to the lightest shard)."""
    load, out = [0] * n, [[] for _ in range(n)]
    for item in sorted(todo, key=lambda t: (-int(t[1].get("size") or 0), t[0], t[1]["corpus"])):
        j = load.index(min(load))
        out[j].append(item)
        load[j] += int(item[1].get("size") or 0)
    return sorted(out[i], key=lambda t: (t[0], t[1]["corpus"]))


def write(rows: list[dict], path=OUT):
    """Add rows to the results file, replacing earlier results for the same corpus."""
    keep = []
    if path.exists():
        with path.open(encoding="utf-8") as f:
            done = {(r["opus_label"], r["corpus"]) for r in rows}
            keep = [r for r in csv.DictReader(f) if (r["opus_label"], r["corpus"]) not in done]
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, FIELDS)
        w.writeheader()
        w.writerows(sorted(keep + rows, key=lambda r: (r["language"], r["opus_label"], r["corpus"])))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("labels", nargs="*", help="OPUS language labels (as paired with English); none: all")
    ap.add_argument("--sample", type=int, default=2000)
    ap.add_argument("--max-pairs", type=int, default=20_000_000, help="skip larger corpora")
    ap.add_argument("--shard", default="0/1", help="i/n: check the i-th of n shards")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--merge", nargs="+", type=Path, help="merge these results files into --out, then stop")
    args = ap.parse_args(argv)
    if args.merge:
        rows = []
        for p in args.merge:
            with p.open(encoding="utf-8") as f:
                rows += list(csv.DictReader(f))
        write(rows, args.out)
        print(f"merged {len(rows)} corpora into {args.out}")
        return
    i, n = map(int, args.shard.split("/"))
    todo = shard(plan(args.labels, args.max_pairs), i, n)
    print(f"{len(todo)} corpora to check in shard {i}/{n}", flush=True)
    lid, rows, label = model(), [], None
    for lab, corpus in todo:
        if lab != label:
            print(lab, flush=True)
            label = lab
        try:
            rows.append(check(lid, lab, corpus, args.sample))
        except Exception as e:  # one unreadable corpus shouldn't lose the rest
            print(f"  {corpus['corpus']}: failed: {e}", flush=True)
    write(rows, args.out)
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as f:
            f.write("| Language | Corpus | Pairs | In the language | Other language | Too short | Top labels |\n"
                    "|---|---|---|---|---|---|---|\n")
            for r in rows:
                f.write(f"| {r['opus_label']} | {r['corpus']} | {r['pairs']:,} | {r['in_language']:.0%} | "
                        f"{r['other_language']:.0%} | {r['too_short']:.0%} | {r['top_labels']} |\n")
    print(f"wrote {args.out} ({len(rows)} corpora checked)")


if __name__ == "__main__":
    sys.exit(main())
