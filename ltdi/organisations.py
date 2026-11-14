"""Who is already working on each language: the organisations behind the datasets, models, benchmarks
and regional services recorded for it (config/organisations.csv, each checked against the
organisation's or project's own page, in the source column).

The global services (Google, Microsoft, Apple, Amazon, OpenAI's and Anthropic's apps) are left out:
they're on every page already, and the point here is the partners a team could work with. Open models
and datasets from large companies' research labs are kept, since their papers and code are where a
team would start."""

from __future__ import annotations

import csv
from functools import lru_cache

from . import CONFIG

# Community and university work first, then regional providers, then everyone else
ORDER = ("collective", "community", "university", "regional", "nonprofit", "open-source", "standards", "company")


@lru_cache(maxsize=1)
def table() -> dict[str, dict]:
    with (CONFIG / "organisations.csv").open(encoding="utf-8") as f:
        return {r["id"]: r for r in csv.DictReader(f)}


def _rank(kind: str) -> int:
    k = kind.lower()
    return next((i for i, w in enumerate(ORDER) if w in k), len(ORDER))


def for_language(offers: set[str], facts: dict, label) -> list[dict]:
    """[{organisation, kind, url, what: [...]}] for one language. offers: the services offering it;
    facts: its recorded values; label(id) names what an id stands for."""
    found: dict[str, dict] = {}
    for i, row in table().items():
        f = facts.get(i)
        has = i in offers or (f is not None and bool(f["value"]))
        if not has:
            continue
        o = found.setdefault(row["organisation"], {"organisation": row["organisation"], "kind": row["kind"],
                                                   "url": row["url"], "what": []})
        w = label(i)
        if w not in o["what"]:
            o["what"].append(w)
    return sorted(found.values(), key=lambda o: (_rank(o["kind"]), -len(o["what"]), o["organisation"]))
