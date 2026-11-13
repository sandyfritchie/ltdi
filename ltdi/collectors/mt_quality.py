"""Machine translation quality: FLORES-200 chrF++ from English, by target language.

Google Translate: Robinson et al. (2023), "ChatGPT MT: Competitive for High- (but Not Low-) Resource
Languages" (WMT 2023, https://aclanthology.org/2023.wmt-1.40/), translated the FLORES-200 test set
from English into each language with Google Translate (115 languages, mid-2023) and scored it with
chrF++. Their scores are in the paper's repository (pinned below).

NLLB-200: Meta's published metrics for the NLLB-200 Dense 3.3B model (the largest model it released
for general use), English into each of 200 languages on FLORES-200 devtest. The metrics file is
linked from the NLLB README (https://github.com/facebookresearch/fairseq/blob/nllb/README.md) and kept
in data/sources, since its host isn't reachable from the collector.

Each score discounts its service where it is poor (services.csv: quality); unmeasured languages keep
full credit. chrF++ counts matching characters, so it isn't comparable across writing systems:
Chinese, Japanese and Korean score far lower than alphabetic languages for equally good output, and
are left out. So is any result in a script other than the language's main one (FLORES has Manipuri
in Bengali script; Google translates into Meitei Mayek), and romanised variants (arb_Latn). Where
two FLORES languages count as one LTDI language (South and North Levantine Arabic), the better
score is kept.
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
GOOGLE_URL = f"{REPO}/blob/{COMMIT}/scores/google-translate.tsv"
GOOGLE_SOURCE = "Google Translate on FLORES-200, English to the language (Robinson et al. 2023)"
NLLB_FILE = DATA / "sources" / "nllb200_dense_3.3b_flores200_metrics.csv"
NLLB_URL = "https://github.com/facebookresearch/fairseq/blob/nllb/README.md"
NLLB_SOURCE = "NLLB-200 Dense 3.3B on FLORES-200 devtest, English to the language (Meta 2022)"
NOTE = ("Translation quality from English: about 50 or more reads well for alphabetic scripts, "
        "under 30 is often hard to use")
NOT_COMPARABLE = {"Hans", "Hant", "Jpan", "Kore", "Hang"}  # chrF on these scripts reads far lower for the same quality


def _scores(pairs) -> dict[str, float]:
    """{LTDI code: chrF++} from (FLORES code, score) pairs, keeping comparable results only."""
    scripts = {l["code"]: l["scripts"] for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))}
    out: dict[str, float] = {}
    for flores, value in pairs:
        iso, script = flores.split("_")
        code = to_ltdi(iso)
        if not code or script in NOT_COMPARABLE:
            continue
        main = (scripts.get(code) or [""])[0]
        if main and script.lower() != main:  # a different script from the one the language is written in
            continue
        out[code] = max(value, out.get(code, 0.0))
    return out


def collect() -> list[Record]:
    google = next(iter(git_files(REPO, "/scores/google-translate.tsv").values()))
    g = _scores((r["Lang"], float(r["chrF2++"])) for r in csv.DictReader(google.splitlines(), delimiter="\t"))
    with NLLB_FILE.open(encoding="utf-8") as f:
        n = _scores((r["direction"].split("-", 1)[1], float(r["chrf++"])) for r in csv.DictReader(f)
                    if r["direction"].startswith("eng_Latn-"))
    return ([Record(c, "mt_google_flores_chrf", v, "chrF++", GOOGLE_SOURCE, GOOGLE_URL,
                    note=NOTE + " (measured mid-2023)") for c, v in sorted(g.items())]
            + [Record(c, "mt_nllb_flores_chrf", v, "chrF++", NLLB_SOURCE, NLLB_URL, note=NOTE)
               for c, v in sorted(n.items())])
