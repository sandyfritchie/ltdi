"""HPLT 3.0's words per language, estimated from its published statistics and checked by language ID.

HPLT's manifest (https://data.hplt-project.org/three/sorted/manifest.json) gives each language-script
subset's characters and documents, but not words, and HPLT's language identification isn't audited:
for small languages much of a subset can be in another language (Iranian Persian filed as Dari,
Arabic and Malay as Kanuri). So for each subset this reads up to 100 documents from the start of the
first file of each quality bin, weights the bins by their files' sizes, and measures

  words per character   whitespace-separated, as tools/text_words.py counts MADLAD-400's
  in-language share     the share of the documents' characters that GlotLID (v3) assigns to the
                        subset's language (or another code the Index files under the same language)

and estimates words = characters x words per character x in-language share, as YODAS2's hours are
scaled by the share of its subtitles in the language.

Scripts that don't separate words with spaces (Chinese, Japanese, Thai, Lao, Khmer, Burmese, Tibetan)
would be undercounted that way, so their subsets are left out; FineWeb-2 counts those with word
segmenters of its own.

data.hplt-project.org isn't reachable from every network, so this runs in GitHub Actions
(hplt-words.yml) and prints one line per subset:

    HPLT <tab> subset <tab> documents <tab> characters <tab> docs_checked <tab> words_per_char <tab> in_language <tab> words

`python tools/hplt_words.py --ingest LOG` turns those lines into config/hplt_words.csv.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

MANIFEST = "https://data.hplt-project.org/three/sorted/manifest.json"
UA = {"User-Agent": "ltdi-collector/0.1 (+https://github.com/sandyfritchie/ltdi)"}
NO_SPACES = {"Hani", "Hans", "Hant", "Jpan", "Thai", "Laoo", "Khmr", "Mymr", "Tibt"}
OUT = ROOT / "config" / "hplt_words.csv"
PER_BIN = 100


def open_url(url: str, method: str = "GET"):
    for attempt in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA, method=method), timeout=120)
        except Exception:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(10 * (attempt + 1))


def first_docs(url: str, n: int) -> list[str]:
    """The text of the first n documents of a .jsonl.zst file, read as a stream."""
    import zstandard

    out = []
    with open_url(url) as r:
        reader = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(r), encoding="utf-8", errors="replace")
        for line in reader:
            if line.strip():
                out.append(json.loads(line).get("text", ""))
            if len(out) >= n:
                break
    return out


def measure() -> None:
    import fasttext
    from huggingface_hub import hf_hub_download

    from ltdi.crosswalk import to_ltdi

    lid = fasttext.load_model(hf_hub_download("cis-lmu/glotlid", "model.bin"))

    def label(text: str) -> str:
        return lid.predict(" ".join(text.split())[:3000])[0][0].replace("__label__", "")

    with open_url(MANIFEST) as r:
        manifest = [json.loads(l) for l in r.read().decode("utf-8").splitlines() if l.strip()]
    for m in manifest:
        name = m["name"]
        iso, script = name.split("_")
        if script in NO_SPACES:
            print(f"skip {name}: no spaces between words", file=sys.stderr)
            continue
        target = to_ltdi(iso) or iso
        bins: dict[str, list[str]] = defaultdict(list)
        for u in m["urls"]:
            bins[u.rsplit("/", 1)[1].split("_")[0]].append(u)
        words = chars = inlang = 0.0
        checked = 0
        for b, urls in bins.items():
            size = 0
            for u in urls:
                with open_url(u, "HEAD") as h:
                    size += int(h.headers.get("Content-Length", 0))
            docs = [d for d in first_docs(sorted(urls)[0], PER_BIN) if d.strip()]
            if not docs or not size:
                continue
            c = sum(len(d) for d in docs)
            w = sum(len(d.split()) for d in docs)
            ok = sum(len(d) for d in docs if (to_ltdi(label(d).split("_")[0]) or "") == target)
            weight = size / c  # each bin stands for its share of the subset's bytes
            words += w * weight
            chars += c * weight
            inlang += ok * weight
            checked += len(docs)
        if not chars:
            continue
        wpc, share = words / chars, inlang / chars
        est = round(m["characters"] * wpc * share)
        print(f"HPLT\t{name}\t{m['documents']}\t{m['characters']}\t{checked}\t{wpc:.4f}\t{share:.3f}\t{est}", flush=True)


def ingest(log: Path) -> None:
    from ltdi.crosswalk import to_ltdi

    rows = []
    for line in log.read_text(encoding="utf-8").splitlines():
        line = line.split("HPLT\t", 1)[-1] if "HPLT\t" in line else ""
        if not line:
            continue
        name, docs, chars, checked, wpc, share, words = line.split("\t")
        code = to_ltdi(name.split("_")[0])
        if not code:
            print(f"unresolved {name}", file=sys.stderr)
            continue
        rows.append({"label": name, "language": code, "documents": docs, "characters": chars, "docs_checked": checked,
                     "words_per_character": wpc, "in_language_share": share, "words": words})
    rows.sort(key=lambda r: r["label"])
    with OUT.open("w", newline="", encoding="utf-8") as f:
        f.write("# HPLT 3.0 (CC0): words per language-script subset, estimated as characters (from HPLT's manifest) x words per\n"
                "# character x the share of the text GlotLID assigns to the language, both measured on up to 100 documents from\n"
                "# each quality bin (bins weighted by size). Written by tools/hplt_words.py; scripts without spaces are left out.\n")
        w = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {OUT.relative_to(ROOT)}: {len(rows)} subsets")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--ingest", type=Path)
    a = ap.parse_args()
    ingest(a.ingest) if a.ingest else measure()
