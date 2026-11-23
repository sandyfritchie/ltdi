"""MediaWiki's interface (Wikipedia's software), translated by volunteers on translatewiki.net.

  ui_mediawiki   a language counts when its translators are active: at least ACTIVE of MediaWiki core's
                 interface messages translated or updated in the twelve months between the two pinned
                 commits below, or, for a translation that needs little upkeep, at least COMPLETE of the
                 messages translated.

translatewiki.net's own statistics are behind a browser check that scripts can't pass, so this reads the
translations where they land: MediaWiki core's languages/i18n/<code>.json, at two pinned commits a year
apart. Core is translatewiki's main project, so its activity stands for a language's community; the
messages of extensions and other projects aren't counted. Update both pins together, a year apart.

Run:  python -m ltdi.collectors mediawiki   (needs git)
"""

from __future__ import annotations

import json
import subprocess

from .. import CACHE
from ..crosswalk import to_ltdi
from ..http import note
from ..records import Record
from ._common import ltdi_codes

REPO = "https://github.com/wikimedia/mediawiki"
NEW, NEW_DAY = "d94bb4a26739278a5f125a3ba57af1af62d3705c", "2026-11-23"
OLD, OLD_DAY = "f81b1d734181e1b6b5c5d3d7208e5f0c1804cfcf", "2025-11-23"
ACTIVE = 100      # messages translated or updated in the year
COMPLETE = 0.9    # share of the interface translated
SKIP = {"en", "qqq", "en-gb", "en-ca", "en-x-piglatin"}
URL = "https://translatewiki.net/wiki/Translating:MediaWiki"


def _files(commit: str) -> dict[str, dict]:
    """languages/i18n/*.json at a commit, from a shallow, blobless, sparse clone kept in the cache."""
    repo = CACHE / "mediawiki-i18n"
    git = ["git", "-c", "gc.auto=0", "-C", str(repo)]
    if not repo.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--no-checkout", "--sparse", REPO, str(repo)], check=True)
        subprocess.run([*git, "sparse-checkout", "set", "--no-cone", "/languages/i18n/*.json"], check=True)
    if subprocess.run([*git, "cat-file", "-e", f"{commit}^{{commit}}"], capture_output=True).returncode:
        subprocess.run([*git, "fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", commit], check=True)
    subprocess.run([*git, "checkout", "-q", commit], check=True)
    note(f"{REPO}@{commit}", commit, NEW_DAY if commit == NEW else OLD_DAY)
    out = {}
    for p in (repo / "languages" / "i18n").glob("*.json"):
        try:
            out[p.stem] = json.loads(p.read_text(encoding="utf-8"))
        except ValueError:
            continue
    return out


def measure() -> dict[str, tuple[int, float, str]]:
    """LTDI code -> (messages translated or updated in the year, share translated, MediaWiki code), best variety."""
    new, old = _files(NEW), _files(OLD)
    english = [k for k in new["en"] if k != "@metadata"]
    best: dict[str, tuple[int, float, str]] = {}
    for code, msgs in new.items():
        if code in SKIP or code.endswith("-formal"):
            continue
        ltdi = to_ltdi(code) or to_ltdi(code.split("-")[0])
        if not ltdi:
            continue
        before = old.get(code, {})
        changed = sum(1 for k, v in msgs.items() if k != "@metadata" and before.get(k) != v)
        share = sum(1 for k in english if k in msgs) / len(english)
        if (changed, share) > best.get(ltdi, (-1, 0, ""))[:2]:
            best[ltdi] = (changed, share, code)
    return best


def collect() -> list[Record]:
    got = measure()
    out = []
    for c in ltdi_codes():
        changed, share, code = got.get(c, (0, 0.0, ""))
        on = changed >= ACTIVE or share >= COMPLETE
        why = (f"{changed:,} interface messages translated or updated in the year to {NEW_DAY}; "
               f"{share:.0%} of MediaWiki's interface translated ({code})") if code else ""
        out.append(Record(c, "ui_mediawiki", int(on), "bool", "MediaWiki interface translations (translatewiki.net)",
                          URL, NEW_DAY, "download", why))
    return out
