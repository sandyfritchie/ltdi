"""Models on the Hugging Face Hub made for each language: a demand signal, since a fine-tuned model
with downloads is evidence of builders already at work.

  hf_models            public models tagged with the language and with at most FOCUSED languages in
                       all, downloaded at least MIN_DOWNLOADS times in the last 30 days
  hf_model_downloads   those models' downloads in the last 30 days, summed

Massively multilingual models (Whisper, NLLB, embedding models tagged with a hundred languages) are
left out: they're counted once for every language they tag, whatever they do for each, and the
open-model indicators already record the ones that matter.

For each language tag found on the Hub's datasets (hf_hub's listing), reads the models with that tag,
most downloaded first, until downloads fall below MIN_DOWNLOADS (at most PAGES pages of 1,000). Tags
that resolve to the same LTDI language are combined, each model counting once. Since only the most
downloaded 3,000 models per tag are read, the largest languages (English, Chinese) are undercounted;
the measure is for telling small languages apart. Results are cached
per tag in .cache/hf_model_tags.json, so an interrupted run resumes; delete it to refresh.

Run:  python -m ltdi.collectors hf_models   (needs huggingface.co; takes about half an hour)
"""

from __future__ import annotations

import datetime as dt
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

from .. import CACHE, http
from ..crosswalk import to_ltdi
from ..http import USER_AGENT
from ..records import Record
from ._common import ltdi_codes
from .hf_hub import listing

API = "https://huggingface.co/api/models"
CACHED = CACHE / "hf_model_tags.json"
FOCUSED = 5
MIN_DOWNLOADS = 10
PAGES = 3
SOURCE = "Hugging Face Hub"


def _get(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                body, headers = resp.read(), resp.headers
            left = re.search(r"r=(\d+);t=(\d+)", headers.get("RateLimit", ""))
            if left and int(left.group(1)) < 5:  # wait out the window rather than hit 429
                time.sleep(int(left.group(2)) + 1)
            return json.loads(body), headers
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 5:
                raise
            time.sleep(int(e.headers.get("Retry-After") or 0) or 30 * (attempt + 1))
    raise RuntimeError(url)


def models_for(tag: str) -> list[list]:
    """[[model id, downloads], ...] for models with the tag and at most FOCUSED languages, down to
    MIN_DOWNLOADS (multilingual models are dropped here, to keep the cache small)."""
    q = urllib.parse.urlencode({"filter": tag, "sort": "downloads", "direction": "-1", "limit": "1000"})
    url, out = f"{API}?{q}&expand[]=downloads&expand[]=tags", []
    for _ in range(PAGES):
        rows, headers = _get(url)
        for m in rows:
            if (m.get("downloads") or 0) < MIN_DOWNLOADS:
                return out
            langs = {to_ltdi(t) for t in m.get("tags", []) if _is_lang(t)} - {None}
            if len(langs) <= FOCUSED:
                out.append([m["id"], m.get("downloads") or 0])
        nxt = re.search(r'<([^>]+)>;\s*rel="next"', headers.get("Link", ""))
        if not nxt or len(rows) < 1000:
            break
        url = nxt.group(1)
    return out


_LANG_TAGS: set[str] = set()


def _is_lang(tag: str) -> bool:
    return tag in _LANG_TAGS


def collect() -> list[Record]:
    tags_by_lang: dict[str, set[str]] = defaultdict(set)
    for labels in listing().values():
        for t in labels:
            if (c := to_ltdi(t)):
                tags_by_lang[c].add(t)
    _LANG_TAGS.update(t for ts in tags_by_lang.values() for t in ts)
    cache = json.loads(CACHED.read_text(encoding="utf-8")) if CACHED.exists() else {}
    todo = sorted(_LANG_TAGS - set(cache))
    CACHE.mkdir(parents=True, exist_ok=True)

    def save():  # write then rename, so an interrupted run never leaves a broken cache
        tmp = CACHED.with_suffix(".tmp")
        tmp.write_text(json.dumps(cache), encoding="utf-8")
        tmp.replace(CACHED)
    from concurrent.futures import ThreadPoolExecutor, as_completed
    with ThreadPoolExecutor(max_workers=3) as pool:
        jobs = {pool.submit(models_for, t): t for t in todo}
        for i, job in enumerate(as_completed(jobs)):
            cache[jobs[job]] = job.result()
            if i % 200 == 0 or i == len(todo) - 1:
                save()
                print(f"  {i + 1:,} of {len(todo):,} tags", flush=True)
    http.note(API, f"{len(cache)} language tags", dt.date.today().isoformat())
    out = []
    codes = set(ltdi_codes())
    for code in sorted(codes):
        seen: dict[str, int] = {}
        for t in tags_by_lang.get(code, ()):
            for mid, downloads in cache.get(t, []):
                seen[mid] = downloads
        if not seen:
            continue
        note = f"Tags: {', '.join(sorted(tags_by_lang[code]))}"
        url = f"https://huggingface.co/models?language={sorted(tags_by_lang[code])[0]}&sort=downloads"
        out.append(Record(code, "hf_models", len(seen), "models", SOURCE, url, note=note))
        out.append(Record(code, "hf_model_downloads", sum(seen.values()), "downloads in 30 days", SOURCE, url, note=note))
    return out
