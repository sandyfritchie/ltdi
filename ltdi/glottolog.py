"""Endangerment levels from Glottolog, for languages LinguaMeta doesn't assess.

Glottolog's Agglomerated Endangerment Status (AES) is the source LinguaMeta took its levels from, but
LinguaMeta's copy predates later releases, which assess more languages. Glottolog's six levels map
onto UNESCO's scale as LinguaMeta maps them. Each value's comment names the assessment it rests on;
some belong to a variety or community rather than the whole language ("Latgalian (376-lav) =
Vulnerable" for Latvian), so `suspect()` flags those for review.

The release is pinned (TAG); the CLDF values are fetched once into .cache (git, sparse).
"""

from __future__ import annotations

import csv
import re
import subprocess
from functools import lru_cache

from . import CACHE

REPO = "https://github.com/glottolog/glottolog-cldf"
TAG = "v5.4"
FILES = ["cldf/values.csv", "cldf/codes.csv"]

LEVEL = {"not endangered": "not_endangered", "threatened": "vulnerable", "shifting": "definitely_endangered",
         "moribund": "severely_endangered", "nearly extinct": "critically_endangered", "extinct": "extinct"}


def _root():
    root = CACHE / f"glottolog-cldf-{TAG}"
    if not all((root / f).exists() for f in FILES):
        CACHE.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--branch", TAG, "--filter=blob:none",
                        "--no-checkout", REPO, str(root)], check=True)
        subprocess.run(["git", "-C", str(root), "sparse-checkout", "set", "--no-cone", *FILES], check=True)
        subprocess.run(["git", "-C", str(root), "checkout", "-q", TAG], check=True)
    return root


@lru_cache(maxsize=1)
def aes() -> dict[str, tuple[str, str]]:
    """{glottocode: (LTDI level, Glottolog's comment)}"""
    root = _root()
    with (root / "cldf/codes.csv").open(encoding="utf-8") as f:
        codes = {r["ID"]: r["Name"] for r in csv.DictReader(f)}
    out = {}
    with (root / "cldf/values.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["Parameter_ID"] == "aes" and codes.get(r["Code_ID"]) in LEVEL:
                out[r["Language_ID"]] = (LEVEL[codes[r["Code_ID"]]], r["Comment"] or "")
    return out


def suspect(comment: str, iso: str | None, name: str) -> bool:
    """Whether the assessment seems to rest on something other than the language itself: the comment's
    first entry names neither the language's ISO code nor its name."""
    first = comment.split(";")[0].split("=")[0]
    if iso and re.search(rf"\b{re.escape(iso)}\b", first):
        return False
    words = [w for w in re.findall(r"\w+", name.lower()) if len(w) > 3]
    return not any(w in first.lower() for w in words)
