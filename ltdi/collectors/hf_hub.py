"""Datasets on the Hugging Face Hub tagged with each language.

  hf_datasets   number of public datasets whose card lists the language
                (by ISO 639-1 and ISO 639-3 tag; a dataset tagged with both counts once)

Run:  python -m ltdi.collectors hf_hub   (needs huggingface.co; English takes a while)
"""

from __future__ import annotations

import json
import re
import urllib.request

from .. import DATA
from ..http import USER_AGENT
from ..records import Record
from ._common import ltdi_codes

API = "https://huggingface.co/api/datasets?filter=language:{tag}&limit=1000"
EXTRA_TAGS = {"cmn": ["zh"], "ar": ["arb"], "sw": ["swh"], "om": ["gaz"], "qu": ["quy", "quz"], "gn": ["grn", "gug"]}


def ids(tag: str) -> set[str]:
    url, out = API.format(tag=tag), set()
    while url:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as resp:
            out |= {d["id"] for d in json.loads(resp.read())}
            m = re.search(r'<([^>]+)>;\s*rel="next"', resp.headers.get("Link", ""))
        url = m.group(1) if m else None
    return out


def collect() -> list[Record]:
    langs = {l["code"]: l for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))}
    out = []
    for code in ltdi_codes():
        tags = {code, langs.get(code, {}).get("iso_639_3") or code, *EXTRA_TAGS.get(code, [])}
        found = set().union(*(ids(t) for t in tags))
        out.append(Record(code, "hf_datasets", len(found), "datasets", "Hugging Face Hub",
                          f"https://huggingface.co/datasets?language=language:{code}",
                          note="Tags: " + ", ".join(sorted(tags))))
    return out
