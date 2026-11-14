"""Universal Dependencies: treebanks (text annotated for grammar) in the latest UD release.

  ud_treebank_words   syntactic words across all of a language's UD treebanks
  ud_treebanks        number of treebanks

The release list comes from UD's validation records (docs-automation), language
codes from its codes_and_flags.yaml, and sizes from each treebank's stats.xml.

Run:  python -m ltdi.collectors ud
"""

from __future__ import annotations

import re

from ..http import fetch_json, fetch_text
from ..records import Record
from . import present
from ._common import ltdi_codes

# The release list pinned to a docs-automation commit; each treebank's statistics read at its release tag
AUTOMATION = "https://raw.githubusercontent.com/UniversalDependencies/docs-automation/88bda9ecd582691bbed991ae985544902d6805d1"
RAW = "https://raw.githubusercontent.com/UniversalDependencies/{repo}/r{version}/stats.xml"
SITE = "https://universaldependencies.org/"


def latest_release() -> tuple[str, list[str]]:
    rel = fetch_json(f"{AUTOMATION}/valdan/releases.json")["releases"]
    version = max(rel, key=lambda v: tuple(int(x) for x in v.split(".")))
    return version, rel[version]["treebanks"]


def language_codes() -> dict[str, str]:
    """UD language name (as in repo names, with underscores) -> UD language code."""
    out, name = {}, None
    for line in fetch_text(f"{AUTOMATION}/codes_and_flags.yaml").splitlines():
        if line and not line.startswith(" ") and line.endswith(":"):
            name = line[:-1].replace(" ", "_")
        elif name and (m := re.match(r"\s+lcode:\s*(\S+)", line)):
            out[name] = m.group(1)
    return out


def collect() -> list[Record]:
    version, treebanks = latest_release()
    lcodes = language_codes()
    words: dict[str, int] = {}
    count: dict[str, int] = {}
    for repo in treebanks:
        lang = repo.removeprefix("UD_").rsplit("-", 1)[0]
        code = next(iter(present({lcodes.get(lang, "")})), None)
        if not code:
            continue
        try:
            stats = fetch_text(RAW.format(repo=repo, version=version))
        except Exception:
            continue
        m = re.search(r"<total>.*?<words>(\d+)</words>", stats, flags=re.S)
        if m:
            words[code] = words.get(code, 0) + int(m.group(1))
            count[code] = count.get(code, 0) + 1
    src = f"Universal Dependencies {version}"
    out = []
    for code in ltdi_codes():
        out.append(Record(code, "ud_treebank_words", words.get(code, 0), "words", src, SITE,
                          note=f"{count.get(code, 0)} treebanks"))
    return out
