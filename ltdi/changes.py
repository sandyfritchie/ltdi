"""What changed, and when: languages a service added or dropped, for language pages and the feed.

Two sources:
  history      data/history.csv (read by ltdi.history_data): half-yearly snapshots of a few series reconstructed from their own
               records (DeepL's documentation history, Common Voice releases, CLDR releases)
  editions     each edition's services table (data/editions/<edition>-services.csv): every service and
               benchmark tracked, so from the second edition on, every one has a change record

An event is a language moving from not offered to offered (+1) or back (-1) between two snapshots.
The reconstructed history reports additions only: it matches names in old documents, so a renamed
entry ("Norwegian (bokmål)" for Norwegian Bokmål) would look like a language dropped. Drops come only
from comparing two editions' own records, which the collectors' drop guard already checks.
The latest half-year runs to the edition, not to its calendar end, so nothing is dated in the future.
build_site puts each language's events in its page data (lang/<n>.json) and writes the Atom feed,
site/changes.xml."""

from __future__ import annotations

import csv
from collections import defaultdict
from html import escape
from pathlib import Path

from . import DATA

SITE_URL = "https://langtechindex.org"
FEED_GROUPS = 60  # entries in the feed: one per service, direction and period


def history_events(h: dict | None = None) -> tuple[list[list], dict[str, str]]:
    """From the history (ltdi.history_data.read, or scores.json's copy)."""
    if h is None:
        from .history_data import read
        h = read()
    if not h:
        return [], {}
    out = []
    for series, col in h["values"].items():
        for lang, v in col.items():
            prev = None
            for p in sorted(v):
                if prev is not None and v[p] > prev:
                    out.append([prev_p, p, series, lang, 1])
                prev, prev_p = v[p], p
    return out, h["series"]


def edition_events(editions: Path | None = None) -> tuple[list[list], dict[str, str]]:
    """Between the two latest editions' services tables, for every service offered (1) or not (0)."""
    editions = editions or DATA / "editions"
    tables = sorted(editions.glob("*-services.csv"))
    if len(tables) < 2:
        return [], {}
    (a, b) = tables[-2:]
    ea, eb = a.name[:-len("-services.csv")], b.name[:-len("-services.csv")]
    old = {r["code"]: r for r in csv.DictReader(a.open(encoding="utf-8"))}
    from .config import services
    labels = {s["id"]: f"{s['name']} ({s['kind']})" for s in services()}
    out = []
    for r in csv.DictReader(b.open(encoding="utf-8")):
        o = old.get(r["code"], {})
        for sid in labels:
            x, y = o.get(sid, ""), r.get(sid, "")
            if x in ("0", "1") and y in ("0", "1") and x != y:
                out.append([ea, eb, sid, r["code"], 1 if y == "1" else -1])
    return out, labels


def all_events(edition: str, history: dict | None = None) -> dict:
    h, hl = history_events(history)
    h = [[a, min(b, edition), s, lang, d] for a, b, s, lang, d in h]
    e, el = edition_events()
    events = sorted(h + e, key=lambda x: (x[1], x[2], -x[4], x[3]), reverse=True)
    return {"series": {**hl, **el}, "events": events}


def _when(a: str, b: str) -> str:
    import datetime as dt
    try:
        fa, fb = dt.datetime.strptime(a, "%Y-%m"), dt.datetime.strptime(b, "%Y-%m")
        return f"{fa:%b %Y} to {fb:%b %Y}" if fa.year != fb.year else f"{fa:%b} to {fb:%b %Y}"
    except ValueError:
        return f"edition {a} to {b}"


def _day(period: str) -> str:
    """A half-year snapshot's last day; an edition's first."""
    return period + {"-06": "-30", "-12": "-31"}.get(period[-3:], "-01")


def feed(data: dict, names: dict[str, str]) -> str:
    groups: dict[tuple, list[str]] = defaultdict(list)
    for a, b, s, lang, d in data["events"]:
        groups[(b, a, s, d)].append(names.get(lang, lang))
    entries = sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][2]), reverse=True)[:FEED_GROUPS]
    updated = _day(max((k[0] for k, _ in entries), default="2026-01")) + "T00:00:00Z"
    items = []
    for (b, a, s, d), langs in entries:
        label = data["series"].get(s, s)
        n = f"{len(langs)} {'language' if len(langs) == 1 else 'languages'}"
        title = f"{label}: {n} added" if d > 0 else f"{label}: {n} no longer listed"
        items.append(f"""  <entry>
    <id>tag:langtechindex.org,2026:changes/{escape(b)}/{escape(s)}/{'add' if d > 0 else 'drop'}</id>
    <title>{escape(title)}</title>
    <updated>{_day(b)}T00:00:00Z</updated>
    <link href="{SITE_URL}/#charts"/>
    <content type="text">{escape(_when(a, b))}: {escape(', '.join(sorted(langs)))}</content>
  </entry>""")
    return f"""<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:langtechindex.org,2026:changes</id>
  <title>Language Technology Development Index: what changed</title>
  <subtitle>Languages that services and open resources added or dropped</subtitle>
  <link href="{SITE_URL}/#charts"/>
  <link rel="self" href="{SITE_URL}/changes.xml"/>
  <updated>{updated}</updated>
  <author><name>Language Technology Development Index</name></author>
{chr(10).join(items)}
</feed>
"""


def write_feed(site: Path, data: dict, names: dict[str, str]) -> int:
    """site/changes.xml from all_events(); build_site puts each language's events in its own data."""
    (site / "changes.xml").write_text(feed(data, names), encoding="utf-8")
    return len(data["events"])
