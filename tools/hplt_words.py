"""HPLT 3.0's words per language, estimated from its published statistics.

HPLT's manifest (https://data.hplt-project.org/three/sorted/manifest.json) gives each language-script
subset's characters and documents, but not words. Words are counted the way tools/text_words.py counts
MADLAD-400's (whitespace-separated), so this measures words per character in the sample documents HPLT
publishes for each subset (a few from each quality bin) and multiplies by the subset's characters.

Scripts that don't separate words with spaces (Chinese, Japanese, Thai, Lao, Khmer, Burmese, Tibetan)
would be undercounted that way, so their subsets are left out; FineWeb-2 counts those with word
segmenters of its own.

data.hplt-project.org isn't reachable from every network, so this runs in GitHub Actions
(hplt-words.yml) and prints one line per subset:

    HPLT <tab> subset <tab> documents <tab> characters <tab> sample_words <tab> sample_characters <tab> words

`python tools/hplt_words.py --ingest LOG` turns those lines into config/hplt_words.csv.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

MANIFEST = "https://data.hplt-project.org/three/sorted/manifest.json"
UA = {"User-Agent": "ltdi-collector/0.1 (+https://github.com/sandyfritchie/ltdi)"}
NO_SPACES = {"Hani", "Hans", "Hant", "Jpan", "Thai", "Laoo", "Khmr", "Mymr", "Tibt"}
OUT = ROOT / "config" / "hplt_words.csv"


def get(url: str) -> str:
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read().decode("utf-8")
        except Exception:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(10 * (attempt + 1))
    return ""


def measure() -> None:
    for line in get(MANIFEST).splitlines():
        if not line.strip():
            continue
        m = json.loads(line)
        name = m["name"]
        if name.split("_")[-1] in NO_SPACES:
            print(f"skip {name}: no spaces between words", file=sys.stderr)
            continue
        docs = [d for bin_ in json.loads(get(m["samples"]))["samples"].values() for d in bin_]
        sw = sum(len(d.split()) for d in docs)
        sc = sum(len(d) for d in docs)
        words = round(m["characters"] * sw / sc) if sc else 0
        print(f"HPLT\t{name}\t{m['documents']}\t{m['characters']}\t{sw}\t{sc}\t{words}", flush=True)


def ingest(log: Path) -> None:
    from ltdi.crosswalk import to_ltdi

    rows = []
    for line in log.read_text(encoding="utf-8").splitlines():
        line = line.split("HPLT\t", 1)[-1] if "HPLT\t" in line else ""
        if not line:
            continue
        name, docs, chars, sw, sc, words = line.split("\t")
        code = to_ltdi(name.split("_")[0])
        if not code:
            print(f"unresolved {name}", file=sys.stderr)
            continue
        rows.append({"label": name, "language": code, "documents": docs, "characters": chars, "words": words,
                     "sample_words": sw, "sample_characters": sc})
    rows.sort(key=lambda r: r["label"])
    with OUT.open("w", newline="", encoding="utf-8") as f:
        f.write("# HPLT 3.0 (CC0): words per language-script subset, estimated as characters (from HPLT's manifest) times the\n"
                "# words per character of HPLT's published sample documents (whitespace-separated, as MADLAD-400's are counted).\n"
                "# Written by tools/hplt_words.py; scripts without spaces between words are left out.\n")
        w = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {OUT.relative_to(ROOT)}: {len(rows)} subsets")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--ingest", type=Path)
    a = ap.parse_args()
    ingest(a.ingest) if a.ingest else measure()
