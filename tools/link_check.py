"""Checks the source links the site shows: every URL in data/records, the config CSVs and the database's
access columns. Hosts with hundreds of per-language URLs of one shape (Hugging Face search pages, PanLex,
OPUS, page views...) are sampled; every other URL is checked. Run in GitHub Actions (links-check.yml),
since most hosts aren't reachable from a development sandbox:

    python tools/link_check.py [--sample 40] [--out link_check.csv]

Writes one row per URL checked: url, status (HTTP code, or 0 on a network error), final_url (after
redirects), error, uses (how many records cite it), where (the first file citing it). Prints a summary
of the failures, grouped by host.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import csv
import os
import random
import re
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "ltdi-collector/0.1 (+https://github.com/sandyfritchie/ltdi)"
FILES = ["config/resources.csv", "config/organisations.csv", "config/speech_datasets.csv", "config/services.csv",
         "config/openslr_archives.csv", "data/dataset_access.csv", "data/mdc_datasets.csv", "data/licensed_speech.csv"]
URL = re.compile(r"https?://[^\s,;\"')<>|]+")
# Per-language URLs of one shape: a sample shows whether the shape still works
SAMPLED = re.compile(r"huggingface\.co/(datasets|models)\?|vocab\.panlex\.org|opus\.nlpl\.eu/results|pageviews\.wmcloud|"
                     r"www\.gstatic\.com|meta\.wikimedia\.org|[a-z-]+\.wikipedia\.org")
DOWNLOADS = re.compile(r"\.(tar\.gz|tgz|zip|tar|gz|bz2|xz|parquet|flac|wav)(\?|$)")


def collect() -> dict[str, tuple[int, str]]:
    uses: Counter = Counter()
    where: dict[str, str] = {}

    def add(text: str, src: str) -> None:
        for u in URL.findall(text or ""):
            u = u.rstrip(".").split("#")[0]
            if "{" in u:
                continue
            uses[u] += 1
            where.setdefault(u, src)

    for f in sorted((ROOT / "data" / "records").glob("*.csv")):
        with f.open(encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                add(r.get("url", ""), f"data/records/{f.name}")
                add(r.get("note", ""), f"data/records/{f.name}")
    for name in FILES:
        p = ROOT / name
        if not p.exists():
            continue
        with p.open(encoding="utf-8") as fh:
            for r in csv.DictReader(l for l in fh if not l.startswith("#")):
                for v in r.values():
                    add(v or "", name)
    return {u: (uses[u], where[u]) for u in uses}


_locks: dict[str, threading.Semaphore] = defaultdict(lambda: threading.Semaphore(2))


def check(url: str) -> tuple[int, str, str]:
    host = re.sub(r"^https?://", "", url).split("/")[0]
    ctx = ssl.create_default_context()
    for attempt in range(3):
        with _locks[host]:
            headers = {"User-Agent": UA, "Accept": "*/*"}
            if host == "huggingface.co" and os.environ.get("HF_TOKEN"):
                headers["Authorization"] = f"Bearer {os.environ['HF_TOKEN']}"
            req = urllib.request.Request(url, headers=headers,
                                         method="HEAD" if DOWNLOADS.search(url) else "GET")
            try:
                with urllib.request.urlopen(req, timeout=40, context=ctx) as r:
                    if req.get_method() == "GET":
                        r.read(4096)
                    return r.status, r.geturl(), ""
            except urllib.error.HTTPError as e:
                if e.code == 405 and req.get_method() == "HEAD":
                    continue
                if e.code in (429, 502, 503, 504) and attempt < 2:
                    time.sleep(30 * (attempt + 1))
                    continue
                return e.code, e.geturl() or url, e.reason if isinstance(e.reason, str) else ""
            except Exception as e:  # noqa: BLE001 (network errors of every kind are a result here)
                if attempt < 2:
                    time.sleep(5)
                    continue
                return 0, url, f"{type(e).__name__}: {e}"[:200]
    return 0, url, "gave up"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=40)
    ap.add_argument("--out", default="link_check.csv")
    a = ap.parse_args()
    urls = collect()
    random.seed(7)
    groups: dict[str, list[str]] = defaultdict(list)
    for u in urls:
        m = SAMPLED.search(u)
        groups[m.group(0) if m else ""].append(u)
    todo = list(groups.pop("", []))
    for g, us in sorted(groups.items()):
        todo += random.sample(sorted(us), min(a.sample, len(us)))
    print(f"{len(urls)} URLs cited; checking {len(todo)} ({len(urls) - len(todo)} per-language URLs not sampled)", flush=True)
    rows = []
    with cf.ThreadPoolExecutor(24) as ex:
        for u, (status, final, err) in zip(todo, ex.map(check, todo)):
            rows.append({"url": u, "status": status, "final_url": final if final != u else "", "error": err,
                         "uses": urls[u][0], "where": urls[u][1]})
    rows.sort(key=lambda r: (r["status"] in (200, 206), r["url"]))
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    bad = [r for r in rows if not 200 <= int(r["status"]) < 400]
    print(f"{len(rows) - len(bad)} fine, {len(bad)} failed")
    by = Counter((re.sub(r"^https?://", "", r["url"]).split("/")[0], r["status"]) for r in bad)
    for (host, status), n in by.most_common():
        print(f"  {n:5d}  {status}  {host}")
    print("Failed:")
    for r in bad[:150]:
        print(f"  {r['status']}  {r['url']}  ({r['where']}, {r['uses']} uses) {r['error']}")
    sys.exit(0)


if __name__ == "__main__":
    main()
