"""Small cached HTTP helper so collectors don't refetch on every run."""

from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.request

from . import CACHE

USER_AGENT = "ltdi-collector/0.1 (+https://github.com/sandyfritchie/ltdi)"


def fetch(url: str, *, cache: bool = True) -> bytes:
    key = hashlib.sha256(url.encode()).hexdigest()[:24]
    path = CACHE / key
    if cache and path.exists():
        return path.read_bytes()
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
    return body


def fetch_json(url: str, **kw):
    return json.loads(fetch(url, **kw))


def fetch_text(url: str, **kw) -> str:
    return fetch(url, **kw).decode("utf-8")
