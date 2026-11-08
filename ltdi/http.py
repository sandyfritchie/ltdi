"""Small cached HTTP helper so collectors don't refetch on every run."""

from __future__ import annotations

import hashlib
import json
import urllib.request
from pathlib import Path

from . import CACHE

USER_AGENT = "ltdi-collector/0.1 (+https://github.com/sandyfritchie/ltdi)"


def fetch(url: str, *, cache: bool = True) -> bytes:
    key = hashlib.sha256(url.encode()).hexdigest()[:24]
    path = CACHE / key
    if cache and path.exists():
        return path.read_bytes()
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read()
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return body


def fetch_json(url: str, **kw):
    return json.loads(fetch(url, **kw))


def fetch_text(url: str, **kw) -> str:
    return fetch(url, **kw).decode("utf-8")
