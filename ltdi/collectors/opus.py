"""Parallel text with English, from OPUS (opus.nlpl.eu): sentence pairs summed over
the latest version of every corpus for the pair.

  parallel_sentences   sentence pairs with English (corpora overlap, so this is an upper bound)

OPUS lists the languages it pairs with English (about a thousand labels, some with script or region
suffixes such as zh_CN or aeb_arab). Every label that resolves to an LTDI language is queried; when
several labels share a corpus, the corpus counts once, at its largest. Languages OPUS does not list
have no parallel text there and are recorded as 0.

Web-mined corpora (CCMatrix, CCAligned, NLLB, WikiMatrix, ...) are often largely in another language,
or in none, for low-resource languages (Kreutzer et al. 2022). Where opus_lid.py has checked a
web-mined corpus (data/opus_lid.csv: GlotLID on a random sample of its lines), it counts at the share
of distinct lines in the language (counting macrolanguage members, and languages GlotLID can't tell
apart, such as Bosnian, Croatian and Serbian); unchecked corpora (over 20M pairs) count in full. English itself is
recorded at a nominal value.

Run:  python -m ltdi.collectors opus   (needs opus.nlpl.eu)
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor

from .. import DATA
from ..crosswalk import to_ltdi
from ..http import fetch_json
from ..records import Record
from ._common import ltdi_codes

LANGUAGES = "https://opus.nlpl.eu/opusapi/?source=en&languages=True"
API = "https://opus.nlpl.eu/opusapi/?source={a}&target={b}&preprocessing=moses&version=latest"
MINED = {"CCMatrix", "CCAligned", "MultiCCAligned", "NLLB", "WikiMatrix", "HPLT", "MaCoCu", "ParaCrawl"}
ENGLISH_NOMINAL = 1e9


CHECKED = DATA / "opus_lid.csv"


# Languages GlotLID can't reliably tell apart, so a line labelled as one counts for the others
CLOSE = [{"bs", "hr", "sr", "cnr"}, {"tzm", "zgh"}]
# Macrolanguage members not counted for the macrolanguage: Indonesian is a standard of its own
NOT_FOR = {("ms", "id")}


@lru_cache(maxsize=1)
def _members() -> dict[str, set[str]]:
    langs = json.loads((DATA / "languages.json").read_text(encoding="utf-8"))
    return {l["code"]: set(l.get("members") or []) for l in langs}


def counts_as(code: str, glotlid: str) -> bool:
    """Whether a GlotLID label (e.g. pbt_Arab) counts as the LTDI language `code`: the same language,
    a member of it (Southern Pashto for Pashto), its macrolanguage (Persian for Dari), or one GlotLID
    can't tell it apart from (Bosnian, Croatian, Serbian)."""
    other = to_ltdi(glotlid.split("_")[0])
    if not other or (code, other) in NOT_FOR:
        return False
    m = _members()
    return (other == code or other in m.get(code, ()) or code in m.get(other, ())
            or any(code in g and other in g for g in CLOSE))


def checked(code_of) -> dict[tuple[str, str], float]:
    """{(OPUS label, corpus): share of sampled lines that are in the language and not repeats} from
    the language check. code_of maps an OPUS label to its LTDI language."""
    if not CHECKED.exists():
        return {}
    out = {}
    with CHECKED.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            code, n = code_of(r["opus_label"]), int(r["sampled"]) or 1
            if r.get("labels"):
                ok = sum(int(x.split(":")[2]) for x in r["labels"].split() if counts_as(code, x.split(":")[0]))
                out[r["opus_label"], r["corpus"]] = round(ok / n, 3)
            else:
                out[r["opus_label"], r["corpus"]] = float(r["in_language"])
    return out


def corpora(label: str) -> dict[str, int]:
    a, b = sorted(["en", label])
    out = {}
    for c in fetch_json(API.format(a=a, b=b)).get("corpora", []):
        n = c.get("alignment_pairs")
        if isinstance(n, int):
            out[c["corpus"]] = max(out.get(c["corpus"], 0), n)
    return out


def collect() -> list[Record]:
    labels: dict[str, list[str]] = defaultdict(list)
    for label in fetch_json(LANGUAGES)["languages"]:
        code = to_ltdi(label.replace("_", "-"))
        if code and code != "en":
            labels[code].append(label)
    flat = sorted({l for ls in labels.values() for l in ls})
    with ThreadPoolExecutor(8) as pool:
        by_label = dict(zip(flat, pool.map(corpora, flat)))
    out, check = [], checked(lambda l: to_ltdi(l.replace("_", "-")))
    for code in ltdi_codes():
        if code == "en":
            out.append(Record(code, "parallel_sentences", ENGLISH_NOMINAL, "sentence pairs", "OPUS",
                              "https://opus.nlpl.eu/", note="English is the pivot; recorded at a nominal value"))
            continue
        merged: dict[str, tuple[int, str]] = {}  # corpus -> (pairs, the label they're listed under)
        for label in labels.get(code, []):
            for name, n in by_label[label].items():
                if n > merged.get(name, (-1, ""))[0]:
                    merged[name] = (n, label)
        listed = sum(n for n, _ in merged.values())
        mined = sum(n for name, (n, _) in merged.items() if name in MINED)
        total, shares = 0.0, []
        for name, (n, label) in sorted(merged.items()):
            share = check.get((label, name)) if name in MINED else None
            total += n if share is None else n * share
            if share is not None:
                shares.append(f"{name} {share:.0%}")
        total = round(total)
        first = labels[code][0] if labels.get(code) else code
        note = []
        if merged:
            note.append(f"{len(merged)} corpora")
        if mined:
            note.append(f"{mined / listed:.0%} web-mined")
        if shares:
            note.append(f"{listed:,} pairs listed; checked web-mined corpora count at the share of lines "
                        f"in the language ({', '.join(shares)})")
        if len(labels.get(code, [])) > 1:
            note.append("OPUS codes " + ", ".join(sorted(labels[code])))
        out.append(Record(code, "parallel_sentences", total, "sentence pairs", "OPUS",
                          f"https://opus.nlpl.eu/results/en&{first}/corpus-result-table", note="; ".join(note)))
    return out
