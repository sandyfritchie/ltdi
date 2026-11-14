"""Retrieval dates are the day the bytes were downloaded, not the day a collector ran (B2)."""
import datetime as dt
import hashlib
import json
import os

import ltdi.http as http
from ltdi.records import Record


def cached(tmp_path, url, body, fetched=None, mtime=None):
    path = tmp_path / hashlib.sha256(url.encode()).hexdigest()[:24]
    path.write_bytes(body)
    if fetched:
        path.with_name(path.name + ".meta").write_text(json.dumps({"url": url, "fetched": fetched,
                                                                  "sha256": hashlib.sha256(body).hexdigest()}))
    if mtime:
        t = dt.datetime.fromisoformat(mtime).timestamp()
        os.utime(path, (t, t))
    return path


def test_record_dated_by_its_bytes(tmp_path, monkeypatch):
    monkeypatch.setattr(http, "CACHE", tmp_path)
    monkeypatch.delenv("LTDI_REFRESH", raising=False)
    monkeypatch.delenv("LTDI_MAX_CACHE_DAYS", raising=False)
    cached(tmp_path, "https://example.org/a", b"old", fetched="2020-01-02")
    cached(tmp_path, "https://example.org/b", b"older", fetched="2019-05-06")
    http.reset()
    assert http.fetch("https://example.org/a") == b"old"
    assert Record("xx", "i", 1, "bool", "s", "u").retrieved == "2020-01-02"
    http.fetch("https://example.org/b")
    assert Record("xx", "i", 1, "bool", "s", "u").retrieved == "2019-05-06"  # the oldest bytes used
    sha, day = http.USED["https://example.org/b"]
    assert day == "2019-05-06" and sha == hashlib.sha256(b"older").hexdigest()


def test_cache_from_before_meta_files_takes_its_file_date(tmp_path, monkeypatch):
    monkeypatch.setattr(http, "CACHE", tmp_path)
    monkeypatch.delenv("LTDI_REFRESH", raising=False)
    path = cached(tmp_path, "https://example.org/c", b"legacy", mtime="2021-03-04T12:00:00")
    http.reset()
    http.fetch("https://example.org/c")
    assert http.oldest_fetch() == "2021-03-04"
    assert json.loads(path.with_name(path.name + ".meta").read_text())["fetched"] == "2021-03-04"


def test_nothing_fetched_dates_today():
    http.reset()
    assert Record("xx", "i", 1, "bool", "s", "u").retrieved == dt.date.today().isoformat()
