"""Mozilla Data Collective (mozilladatacollective.com): speech datasets that communities and
organisations share there, from its public catalog API (no key needed for the list).

Open speech counts towards open_speech_hours (speech.py reads these records; run mdc first):
  speech_mdc                    read speech under an open licence (CC0, CC BY, CC BY-SA, ...)
  speech_mdc_nc                 read speech free to download under a non-commercial or otherwise
                                restricted licence (CC BY-NC, CC BY-ND, NOODL)
  speech_mdc_spontaneous(_nc)   the same for conversation, interviews, voice notes and video

Datasets sold for a fee or shared under the platform's own or a company's data licence agreement aren't
open data, so they aren't counted; they're listed in data/licensed_speech.csv for each language's page.

Left out: Common Voice (counted from its own release files, common_voice.py) and copies of it; datasets
the Index already counts from their own source (FLEURS, WAXAL, IndicVoices, ...); synthetic speech;
evaluation sets; listings without files; untranscribed field recordings; earlier versions of a dataset
shared again; and datasets covering several languages at once. Hours are
read from each dataset's own name and description ("9.8h", "150 Hours", "56 minutes"): a dataset that
doesn't state its hours is listed but adds none. The same OpenSLR corpus shared twice counts once.

Run:  python -m ltdi.collectors mdc   (needs mozilladatacollective.com)
"""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict

from .. import DATA
from ..crosswalk import to_ltdi
from ..http import fetch_json
from ..records import Record
from ._common import ltdi_codes

API = "https://mozilladatacollective.com/api/datasets?limit=100&page={page}"
SITE = "https://mozilladatacollective.com/datasets"
LICENSED = DATA / "licensed_speech.csv"

OPEN = {"CC0-1.0", "CC-BY-4.0", "CC-BY-3.0", "CC-BY-SA-4.0", "CC-BY-SA-3.0", "Apache-2.0", "MIT", "GPL-3.0",
        "ODbL-1.0", "Unlicense", "PDDL-1.0"}
RESTRICTED = re.compile(r"\bN[CD]\b|-N[CD]\b|NOODL", re.I)  # non-commercial, no-derivatives, NOODL
# locales the catalog gives a code the Index reads differently (checked against each dataset's name)
LOCALE_FIX = {"srk": "skr", "cn": "cmn"}
COUNTED_ELSEWHERE = re.compile(r"\b(FLEURS|NaijaVoices|WAXAL|IndicVoices|Kathbath|Shrutilipi|Vaani|VoxPopuli|"
                               r"Multilingual LibriSpeech|YODAS|WenetSpeech|GigaSpeech|OpenSLR|Omnilingual|African Next Voices|AfriVoices)\b", re.I)
SPONTANEOUS = re.compile(r"spontaneous|conversation|interview|vlog|voice[- ]notes?|free[- ]form|YouTube|"
                         r"radio|broadcast|podcast|call[- ]cent", re.I)
HOURS = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*\+?\s*(?:hours?|hrs?|h)\b", re.I)
MINUTES = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*(?:minutes|mins?)\b", re.I)
PART = re.compile(r"\bPart\s*\d+\s*of\s*(\d+)", re.I)               # 'Somali (68 hours), Part 1 of 3': 68 in all
VERSION = re.compile(r"\s*\((?:V|Version\s*)(\d+)(?:\s*-\s*Part\s*\d+)?\)\s*$")  # 'Khmer ... (Version 3 - Part 2)'
# Shared again in a fuller form, so counted once (the fuller one stays)
SUPERSEDED = re.compile(r"^Thorsten-Voice Dataset 20\d\d\.\d\d$")


def catalog() -> list[dict]:
    items, page = [], 1
    while True:
        got = fetch_json(API.format(page=page))
        items += got.get("items", [])
        if not got.get("items") or len(items) >= got.get("total", 0):
            return items
        page += 1


def hours_of(d: dict) -> float | None:
    """The hours a dataset states, from its name first, then its descriptions."""
    for i, text in enumerate((d.get("name"), d.get("shortDescription"), d.get("longDescription"))):
        if not text:
            continue
        if m := HOURS.search(text):
            part = PART.search(d.get("name") or "")
            return float(m.group(1).replace(",", "")) / (int(part.group(1)) if part and i == 0 else 1)
        if m := MINUTES.search(text):
            return float(m.group(1).replace(",", "")) / 60
    return None


def name_of(d: dict) -> str:
    return re.sub(r"\s*\U0001F6A7\s*", " ", d.get("name") or "").strip()  # the platform's construction-sign marks


def kind_of(d: dict) -> str:
    """open, restricted (free, but not for every use) or licensed (a fee, or a data licence agreement)."""
    lic = d.get("licenseAbbreviation") or ""
    if (d.get("pricing") or {}).get("isPaid") or d.get("isPaid"):
        return "licensed"
    if lic in OPEN:
        return "open"
    return "restricted" if RESTRICTED.search(lic) else "licensed"


def collect() -> list[Record]:
    codes = set(ltdi_codes())
    counted: dict[tuple[str, str], dict[str, tuple[float, str]]] = defaultdict(dict)  # (code, indicator) -> key -> (hours, label)
    licensed = []
    items = catalog()
    # of a dataset shared in versions, only the latest counts: (name without its version) -> latest version
    latest: dict[str, int] = {}
    for d in items:
        v = VERSION.search(name_of(d))
        base = VERSION.sub("", name_of(d))
        latest[base] = max(latest.get(base, 1), int(v.group(1)) if v else 1)
    for d in items:
        org = (d.get("organization") or {}).get("name") or ""
        name, text = name_of(d), " ".join(filter(None, [d.get("name"), d.get("shortDescription")]))
        if d.get("task") not in ("ASR", "TTS") or org == "Mozilla Common Voice" or name.startswith("Common Voice"):
            continue
        if re.search(r"\bsynthe(?:tic|ic|sized)\b", text, re.I) or COUNTED_ELSEWHERE.search(text) or (d.get("sizeBytes") or 0) < 5e6:
            continue
        v = VERSION.search(name)
        if (int(v.group(1)) if v else 1) < latest.get(VERSION.sub("", name), 1) or SUPERSEDED.match(name):
            continue
        if re.search(r"\bAudio$", name):  # field recordings; their transcribed part is shared as its own dataset
            continue
        locs = [p.strip() for p in re.split(r"[,;]", d.get("locale") or "") if p.strip()]
        if len(locs) != 1:
            continue
        code = to_ltdi(LOCALE_FIX.get(locs[0], locs[0]))
        if code not in codes:
            continue
        h, kind = hours_of(d), kind_of(d)
        url = d.get("datasetUrl") or f"{SITE}/{d['id']}"
        task = "speech recognition" if d.get("task") == "ASR" else "text-to-speech"
        if kind == "licensed":
            licensed.append({"language": code, "name": name, "steward": org, "task": task,
                             "hours": "" if h is None else round(h, 1), "licence": d.get("licenseAbbreviation") or "",
                             "paid": "yes" if (d.get("pricing") or {}).get("isPaid") else "no", "url": url})
            continue
        if not h or re.search(r"evaluation|test set|benchmark", text, re.I):
            continue
        ind = "speech_mdc" + ("_spontaneous" if SPONTANEOUS.search(text) else "") + ("_nc" if kind == "restricted" else "")
        slr = re.search(r"OpenSLR\s*(\d+)", text, re.I)
        key = f"openslr{slr.group(1)}" if slr else d["id"]
        label = f"{name}{f' ({org})' if org else ''} {h:,.1f} h, {d.get('licenseAbbreviation')}"
        if h > counted[(code, ind)].get(key, (0, ""))[0]:
            counted[(code, ind)][key] = (h, label)

    with LICENSED.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["language", "name", "steward", "task", "hours", "licence", "paid", "url"], lineterminator="\n")
        w.writeheader()
        w.writerows(sorted(licensed, key=lambda r: (r["language"], r["name"])))
    out = []
    for (code, ind), ds in sorted(counted.items()):
        total = sum(h for h, _ in ds.values())
        out.append(Record(code, ind, round(total, 1), "hours", "Mozilla Data Collective", SITE, method="api",
                          note="; ".join(label for _, label in sorted(ds.values(), key=lambda x: -x[0]))))
    return out


if __name__ == "__main__":
    print(json.dumps([r.__dict__ for r in collect()][:5], indent=1, default=str))
