"""Small cached HTTP helper so collectors don't refetch on every run.

Each cached body has a <key>.meta file beside it: the URL, the day its bytes were downloaded and
their SHA-256. A record's "retrieved" date is the download day of the oldest bytes its collector used
(records.Record's default, via oldest_fetch), not the day the collector ran, so re-running on cached
bytes doesn't make old data look new. Bodies cached before .meta files existed take their file's
modification day.

LTDI_REFRESH=1 (or python -m ltdi.collectors --refresh) downloads everything again;
LTDI_MAX_CACHE_DAYS=N (--max-age N) re-downloads anything cached more than N days ago."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import time
import urllib.error
import urllib.request

from . import CACHE

USER_AGENT = "ltdi-collector/0.1 (+https://github.com/sandyfritchie/ltdi)"

# What this run has used since the last reset(): url -> (sha256, download day)
USED: dict[str, tuple[str, str]] = {}


def reset() -> None:
    """Start tracking afresh (the collectors runner calls this before each collector)."""
    USED.clear()


def note(url: str, sha: str, day: str) -> None:
    """Record bytes used that didn't come through fetch (a git clone, say): its commit or hash and day."""
    USED[url] = (sha, day)


def oldest_fetch() -> str | None:
    """The download day of the oldest bytes used since reset(), or None if nothing was fetched."""
    return min((d for _, d in USED.values()), default=None)


def _meta(path) -> dict | None:
    m = path.with_name(path.name + ".meta")
    if m.exists():
        return json.loads(m.read_text(encoding="utf-8"))
    return None


def _write_meta(path, url: str, body: bytes, day: str) -> dict:
    meta = {"url": url, "fetched": day, "sha256": hashlib.sha256(body).hexdigest()}
    path.with_name(path.name + ".meta").write_text(json.dumps(meta) + "\n", encoding="utf-8")
    return meta


def fetch(url: str, *, cache: bool = True) -> bytes:
    key = hashlib.sha256(url.encode()).hexdigest()[:24]
    path = CACHE / key
    max_days = os.environ.get("LTDI_MAX_CACHE_DAYS")
    refresh = os.environ.get("LTDI_REFRESH") == "1"
    if cache and not refresh and path.exists():
        body = path.read_bytes()
        meta = _meta(path) or _write_meta(path, url, body, dt.date.fromtimestamp(path.stat().st_mtime).isoformat())
        age = (dt.date.today() - dt.date.fromisoformat(meta["fetched"])).days
        if not max_days or age <= int(max_days):
            USED[url] = (meta["sha256"], meta["fetched"])
            return body
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read()
            break
        except urllib.error.HTTPError as e:  # rate limited: wait as asked, then try again
            if e.code != 429 or attempt == 5:
                raise
            time.sleep(min(int(e.headers.get("Retry-After") or 0) or 5 * 2 ** attempt, 120))
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    meta = _write_meta(path, url, body, dt.date.today().isoformat())
    USED[url] = (meta["sha256"], meta["fetched"])
    return body


def fetch_json(url: str, **kw):
    return json.loads(fetch(url, **kw))


def fetch_text(url: str, **kw) -> str:
    return fetch(url, **kw).decode("utf-8")
