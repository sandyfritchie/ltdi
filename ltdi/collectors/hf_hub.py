"""Datasets on the Hugging Face Hub tagged with each language.

  hf_datasets   number of public datasets whose card lists the language
                (any tag that resolves to the language, e.g. sw and swh; a dataset counts once)

Datasets tagged with many languages (Bible corpora, web crawls, machine-translated sets and their
many re-uploads) would otherwise make up most of the count for smaller languages, whatever they hold
for each one. A dataset tagged with more than 20 languages counts as 20 / (languages it tags):
one tagged with 200 languages counts a tenth for each.

Reads the whole dataset listing once (about a thousand datasets per request, within the Hub's
rate limit) and keeps each dataset's language tags, so the cost does not grow with the number of
languages. The listing is cached in .cache/hf_language_tags.json; delete it to refresh.

Run:  python -m ltdi.collectors hf_hub   (needs huggingface.co; takes several minutes)
"""

from __future__ import annotations

import json
import re
import time
import urllib.request
from collections import defaultdict

from .. import CACHE
from ..crosswalk import to_ltdi
from ..http import USER_AGENT
from ..records import Record
from ._common import ltdi_codes

API = "https://huggingface.co/api/datasets?limit=1000&expand[]=tags"
LISTING = CACHE / "hf_language_tags.json"


def listing() -> dict[str, list[str]]:
    """Dataset id -> its language tags, for every public dataset that has any."""
    if LISTING.exists():
        return json.loads(LISTING.read_text(encoding="utf-8"))
    out, url, pages = {}, API, 0
    while url:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=180) as resp:
                    body, headers = resp.read(), resp.headers
                break
            except urllib.error.HTTPError as e:
                if e.code != 429 or attempt == 4:
                    raise
                time.sleep(60)
        for d in json.loads(body):
            tags = [t[9:] for t in d.get("tags", []) if t.startswith("language:")]
            if tags:
                out[d["id"]] = tags
        m = re.search(r'<([^>]+)>;\s*rel="next"', headers.get("Link", ""))
        url = m.group(1) if m else None
        pages += 1
        left = re.search(r"r=(\d+);t=(\d+)", headers.get("RateLimit", ""))
        if left and int(left.group(1)) < 5:  # wait out the window rather than hit 429
            time.sleep(int(left.group(2)) + 1)
        if pages % 50 == 0:
            print(f"  {pages} pages, {len(out)} datasets with language tags")
    CACHE.mkdir(parents=True, exist_ok=True)
    LISTING.write_text(json.dumps(out), encoding="utf-8")
    return out


MANY = 20  # languages a dataset can tag and still count in full for each


def collect() -> list[Record]:
    found: dict[str, set[str]] = defaultdict(set)
    tags: dict[str, set[str]] = defaultdict(set)
    width: dict[str, int] = {}
    for ds, labels in listing().items():
        codes = {c: l for l in labels if (c := to_ltdi(l))}
        width[ds] = len(set(codes))
        for label in labels:
            code = to_ltdi(label)
            if code:
                found[code].add(ds)
                tags[code].add(label)
    out = []
    for code in ltdi_codes():
        weighted = sum(min(1.0, MANY / width[ds]) for ds in found[code])
        many = sum(width[ds] > MANY for ds in found[code])
        note = [f"{len(found[code])} datasets"] if found[code] else []
        if many:
            note.append(f"{many} tagged with more than {MANY} languages, counted in part")
        if tags[code]:
            note.append("tags: " + ", ".join(sorted(tags[code])))
        out.append(Record(code, "hf_datasets", round(weighted, 1), "datasets, weighted", "Hugging Face Hub",
                          f"https://huggingface.co/datasets?language=language:{code}", note="; ".join(note)))
    return out
