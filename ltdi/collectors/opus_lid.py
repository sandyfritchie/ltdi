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
Writes data/opus_lid.csv.
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
from datetime import date

from .. import CACHE, DATA
from ..crosswalk import to_ltdi
from ..http import USER_AGENT, fetch_json
from .opus import API, MINED

MODEL_REPO = "https://huggingface.co/cis-lmu/glotlid"
MODEL_REV = "e9592e0a9bc3b6f2a946de94faaa188d1dd6f522"
MODEL_FILE = "model_v3.bin"  # GlotLID v3, the version credited under language identification
MODEL_URL = f"{MODEL_REPO}/resolve/{MODEL_REV}/{MODEL_FILE}"
OUT = DATA / "opus_lid.csv"
CHUNK = 16 * 1024 * 1024
EXAMPLES = 8  # lines in another language printed per corpus, to see what they are
MIN_WORDS = 3  # shorter lines are too short to identify reliably; counted separately
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
    long = [l for l in lines if len(l.split()) >= MIN_WORDS]
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
    shorts = [l for l in lines if len(l.split()) < MIN_WORDS]
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


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("labels", nargs="+", help="OPUS language labels (as paired with English)")
    ap.add_argument("--sample", type=int, default=2000)
    args = ap.parse_args(argv)
    lid = model()
    rows = []
    for label in args.labels:
        print(label, flush=True)
        for corpus in mined_corpora(label):
            try:
                rows.append(check(lid, label, corpus, args.sample))
            except Exception as e:  # one unreadable corpus shouldn't lose the rest
                print(f"  {corpus['corpus']}: failed: {e}", flush=True)
    keep = []
    if OUT.exists():  # keep earlier results for other languages
        with OUT.open(encoding="utf-8") as f:
            done = {(r["opus_label"], r["corpus"]) for r in rows}
            keep = [r for r in csv.DictReader(f) if (r["opus_label"], r["corpus"]) not in done]
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, FIELDS)
        w.writeheader()
        w.writerows(sorted(keep + rows, key=lambda r: (r["language"], r["corpus"])))
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as f:
            f.write("| Language | Corpus | Pairs | In the language | Other language | Too short | Top labels |\n"
                    "|---|---|---|---|---|---|---|\n")
            for r in rows:
                f.write(f"| {r['opus_label']} | {r['corpus']} | {r['pairs']:,} | {r['in_language']:.0%} | "
                        f"{r['other_language']:.0%} | {r['too_short']:.0%} | {r['top_labels']} |\n")
    print(f"wrote {OUT} ({len(rows)} corpora checked)")


if __name__ == "__main__":
    sys.exit(main())
