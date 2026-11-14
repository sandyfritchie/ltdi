"""The vendor page parsers, run on the pages they last read, reproduce the committed records (B3/E4).

The pages are the vendors' own documentation, so they aren't stored in the repository: the test runs
where the collector's cache holds them (data/sources_manifest.csv lists each page with its SHA-256 and
download day) and is skipped elsewhere, such as in CI."""
import csv
import hashlib

import pytest

from ltdi import CACHE, DATA
from ltdi.records import read_records


def vendor_pages():
    with (DATA / "sources_manifest.csv").open(encoding="utf-8") as f:
        return [r for r in csv.DictReader(f) if r["collector"] == "vendors"]


def test_parsers_reproduce_the_records():
    pages = vendor_pages()
    for p in pages:
        path = CACHE / hashlib.sha256(p["url"].encode()).hexdigest()[:24]
        if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != p["sha256"]:
            pytest.skip("the vendor pages in the manifest aren't in the local cache")
    from ltdi.collectors import vendors
    langs = sorted({r.language for r in read_records(DATA / "records" / "vendors.csv") if r.language != "*"})
    key = lambda r: (r.language, r.indicator, float(r.value), r.note)
    got = {key(r) for r in vendors.collect() if r.value}
    want = {key(r) for r in read_records(DATA / "records" / "vendors.csv", langs) if r.value}
    assert got == want, (sorted(got - want)[:5], sorted(want - got)[:5])
