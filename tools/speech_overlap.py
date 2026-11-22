"""Flag open speech that might be counted twice for a language: two sources from the same organisation,
the same family of recordings (Bible readings, LibriVox audiobooks, YouTube video) in two sources, or a
known overlap. Prints one line per flag, to check by hand after adding sources:

    python tools/speech_overlap.py

Overlaps found and settled so far (see the collectors): copies of Common Voice, FLEURS, OpenSLR and the
datasets counted from their own source are left out of the Mozilla Data Collective (mdc.py); Maseno's
Dholuo set there is part of AfriVoices-KE; sample sets shared beside their full dataset count once;
WAXAL's v2 is a re-split of v1, so only v1 counts.
"""

from __future__ import annotations

import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ltdi import CONFIG, DATA  # noqa: E402

FAMILIES = {"Bible readings": r"\bBible|BibleTTS", "LibriVox audiobooks": r"LibriVox|LibriSpeech",
            "YouTube video": r"YouTube|YODAS|GigaSpeech", "broadcast radio": r"All India Radio|Shrutilipi|radio"}
# organisations behind each source counted outside the Data Collective (config/organisations.csv)
ORGS = {}


def main() -> None:
    with (CONFIG / "organisations.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            ORGS[r["id"]] = r["organisation"]
    sets: dict[str, list[tuple[str, str, float]]] = defaultdict(list)  # code -> (source, text, hours)
    for name in ("speech.csv", "common_voice.csv"):
        with (DATA / "records" / name).open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                ind = r["indicator"]
                if (ind.startswith("speech_") or ind.startswith("cv_")) and r["language"] != "*" and float(r["value"] or 0) >= 0.5:
                    sets[r["language"]].append((ind, f"{r['source']} {ORGS.get(ind, '')} {r['note']}", float(r["value"])))
    with (DATA / "records" / "mdc.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            for part in filter(None, r["note"].split("; ")):
                h = re.search(r"([\d.]+) h,", part)
                sets[r["language"]].append(("mdc", part, float(h.group(1)) if h else 0.0))
    flags = 0
    for code, items in sorted(sets.items()):
        if len(items) < 2:
            continue
        for fam, pat in FAMILIES.items():
            hit = [(s, t) for s, t, _ in items if re.search(pat, t, re.I)]
            if len({s if s != "mdc" else t for s, t in hit}) > 1:
                flags += 1
                print(f"{code}\t{fam}\t" + " | ".join(t[:70] for _, t in hit))
        orgs = defaultdict(set)
        for s, t, _ in items:
            for org in re.findall(r"\(([^()]*(?:Global|University|Universit|Institute|Foundation|AI4Bharat|Google|Meta|SIL)[^()]*)\)", t):
                orgs[org.strip()].add(s if s != "mdc" else t[:40])
        for org, srcs in orgs.items():
            if len(srcs) > 1:
                flags += 1
                print(f"{code}\tsame organisation: {org}\t" + " | ".join(sorted(srcs)))
    print(f"{flags} possible overlaps to check", file=sys.stderr)


if __name__ == "__main__":
    main()
