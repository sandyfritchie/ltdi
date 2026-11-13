"""Machine translation quality: FLORES-200 chrF++ from English, by target language.

Robinson et al. (2023), "ChatGPT MT: Competitive for High- (but Not Low-) Resource Languages"
(WMT 2023, https://aclanthology.org/2023.wmt-1.40/), translated the FLORES-200 test set from English
into each language with Google Translate (115 languages, mid-2023) and scored it with chrF++. Their
scores are in the paper's repository (pinned below). The score discounts Google's translation
service where it is poor (services.csv: quality); unmeasured languages keep full credit.

chrF++ counts matching characters, so it isn't comparable across writing systems: Chinese, Japanese
and Korean score far lower than alphabetic languages for equally good output, and are left out.
So is any result in a script other than the language's main one (FLORES has Manipuri in Bengali
script; Google translates into Meitei Mayek), and romanised variants (arb_Latn).
"""

from __future__ import annotations

import csv
import json

from .. import DATA
from ..crosswalk import to_ltdi
from ..records import Record
from ._common import git_files

REPO = "https://github.com/cmu-llab/gpt_mt_benchmark"
COMMIT = "0326b5217cb998e63b8ee90e7830c37cce16eb9b"
URL = f"{REPO}/blob/{COMMIT}/scores/google-translate.tsv"
SOURCE = "Google Translate on FLORES-200, English to the language (Robinson et al. 2023)"
NOT_COMPARABLE = {"Hans", "Hant", "Jpan", "Kore", "Hang"}  # chrF on these scripts reads far lower for the same quality


def collect() -> list[Record]:
    files = git_files(REPO, "/scores/google-translate.tsv")
    text = next(iter(files.values()))
    scripts = {l["code"]: l["scripts"] for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))}
    out = []
    for r in csv.DictReader(text.splitlines(), delimiter="\t"):
        iso, script = r["Lang"].split("_")
        code = to_ltdi(iso)
        if not code or script in NOT_COMPARABLE:
            continue
        main = (scripts.get(code) or [""])[0]
        if main and script.lower() != main:  # a different script from the one the language is written in
            continue
        out.append(Record(code, "mt_google_flores_chrf", float(r["chrF2++"]), "chrF++", SOURCE, URL,
                          note="Translation quality from English, measured mid-2023: about 50 or more reads well "
                               "for alphabetic scripts, under 30 is often hard to use"))
    return out
