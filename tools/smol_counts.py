"""Counts Google's SMOL and GATITOS translations per language (huggingface.co/datasets/google/smol, CC BY 4.0).

  SmolSent   sentences professionally translated from English (or Russian etc.): one pair per row
  SmolDoc    documents professionally translated: pairs are the document's aligned sentences
  GATITOS    words and short phrases translated from English: one pair per row

Hugging Face's file storage isn't reachable from every network, so this runs in GitHub Actions
(smol-counts.yml) and prints one line per file:

    SMOL <tab> subset <tab> file <tab> source <tab> target <tab> rows <tab> pairs

`python tools/smol_counts.py --ingest LOG` writes config/smol_counts.csv, which the OPUS collector adds
to each language's translation pairs (OPUS doesn't include these datasets).
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
HF = "https://huggingface.co"
REPO = "google/smol"
UA = {"User-Agent": "ltdi-collector/0.1 (+https://github.com/sandyfritchie/ltdi)"}
OUT = ROOT / "config" / "smol_counts.csv"


def get(url: str) -> bytes:
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except Exception:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(10 * (attempt + 1))
    return b""


def pairs_in(row: dict) -> int:
    """Aligned sentence pairs in a SmolDoc row (a list of target sentences), else 1."""
    for key in ("trgs", "targets", "tgt_sents", "trg_sents"):
        if isinstance(row.get(key), list):
            return len(row[key])
    return 1


def measure() -> None:
    files = json.loads(get(f"{HF}/api/datasets/{REPO}"))["siblings"]
    shown = False
    for f in sorted(s["rfilename"] for s in files):
        if not f.endswith(".jsonl"):
            continue
        subset = f.split("/")[0]
        rows = [json.loads(l) for l in get(f"{HF}/datasets/{REPO}/resolve/main/{f}").decode("utf-8").splitlines() if l.strip()]
        if not rows:
            continue
        if not shown:
            print(f"fields of {f}: {sorted(rows[0])}", file=sys.stderr)
            shown = True
        src = rows[0].get("sl") or rows[0].get("src_lang") or ""
        tgt = rows[0].get("tl") or rows[0].get("trg_lang") or rows[0].get("tgt_lang") or ""
        if not tgt:  # gatitos/ak_en.jsonl: the language is in the file name
            m = re.match(r"(.+?)_(.+?)\.jsonl$", f.split("/")[-1])
            src, tgt = (m.group(2), m.group(1)) if m else ("", "")
        pairs = sum(pairs_in(r) for r in rows) if subset == "smoldoc" else len(rows)
        print(f"SMOL\t{subset}\t{f}\t{src}\t{tgt}\t{len(rows)}\t{pairs}", flush=True)


def ingest(log: Path) -> None:
    from ltdi.crosswalk import to_ltdi

    out = []
    for line in log.read_text(encoding="utf-8").splitlines():
        if "SMOL\t" not in line:
            continue
        subset, f, src, tgt, rows, pairs = line.split("SMOL\t", 1)[1].split("\t")
        code = to_ltdi(tgt) or to_ltdi(tgt.split("-")[0].split("_")[0])
        if not code:
            print(f"unresolved {tgt} ({f})", file=sys.stderr)
            continue
        out.append({"subset": subset, "file": f, "source": src, "target": tgt, "language": code, "rows": rows, "pairs": pairs})
    out.sort(key=lambda r: (r["language"], r["subset"], r["file"]))
    with OUT.open("w", newline="", encoding="utf-8") as fh:
        fh.write("# Google's SMOL (SmolSent, SmolDoc) and GATITOS, CC BY 4.0: professionally translated pairs per file, counted by\n"
                 "# tools/smol_counts.py. SmolDoc's pairs are its documents' aligned sentences; GATITOS's are words and short phrases.\n")
        w = csv.DictWriter(fh, fieldnames=list(out[0]), lineterminator="\n")
        w.writeheader()
        w.writerows(out)
    print(f"wrote {OUT.relative_to(ROOT)}: {len(out)} files, {len({r['language'] for r in out})} languages")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--ingest", type=Path)
    a = ap.parse_args()
    ingest(a.ingest) if a.ingest else measure()
