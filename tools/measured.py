"""Re-measure the datasets whose size the Index measures itself, because their makers don't publish it per
language, and write the results back into config. Run quarterly by .github/workflows/measured-refresh.yml.

  Omnilingual ASR Corpus   hours, from every clip's audio     (Hugging Face)
  WAXAL TTS                hours, from every clip's audio     (Hugging Face; the configs its card lists)
  OpenSLR                  hours, from every clip's audio     (config/openslr_archives.csv)
  Bloom Library            hours, from every clip's audio     (Hugging Face, gated: needs HF_TOKEN)
  MADLAD-400               words, from every document         (Hugging Face; its smaller languages)
  IndicVoices              hours, from its duration column    (Hugging Face, gated: needs HF_TOKEN; read with
                                                               range requests, since its files are terabytes)

  python tools/measured.py jobs                  the Actions matrix: one entry per job and shard
  python tools/measured.py run JOB I/N           measure one shard, printing the measuring tools' lines
  python tools/measured.py ingest DIR [--force]  read every shard's output in DIR and rewrite
                                                 config/speech_datasets.csv (measured rows only) and
                                                 config/madlad_words.csv

ingest stops without writing when a dataset loses more than a quarter of its hours or words, or a tenth
of its languages, since that usually means a failed download rather than a smaller dataset; check the
logs, then rerun with --force if the change is real.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import subprocess
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ltdi.collectors._common import ltdi_codes  # noqa: E402
from ltdi.crosswalk import to_ltdi  # noqa: E402
from ltdi.names import resolve  # noqa: E402

CONFIG = ROOT / "config"
SHARDS = {"omnilingual": 8, "waxal_tts": 4, "openslr": 8, "bloom": 1, "madlad": 4, "indicvoices": 4}
INDICVOICES = "ai4bharat/IndicVoices"
HF = "https://huggingface.co"
OMNI, WAXAL, MADLAD = "facebook/omnilingual-asr-corpus", "google/WaxalNLP", "allenai/MADLAD-400"

# How each measured dataset appears in config/speech_datasets.csv
ROWS = {
    "omnilingual": ("Omnilingual ASR Corpus", "CC BY 4.0", f"{HF}/datasets/{OMNI}",
                    "Meta's commissioned recordings of people answering questions in their own words, transcribed; hours measured from its files"),
    "waxal_tts": ("WAXAL TTS", "CC BY 4.0 or CC BY-SA 4.0", f"{HF}/datasets/{WAXAL}",
                  "Studio recordings of single speakers reading phonetically balanced scripts; hours measured from its files"),
    "indicvoices": ("IndicVoices", "CC BY 4.0", f"{HF}/datasets/{INDICVOICES}",
                    "Natural, read and conversational speech from across India (AI4Bharat), transcribed; hours from every clip's duration in the Hugging Face release (train and valid); gated: accept its terms on Hugging Face"),
    "bloom_open": ("Bloom Library", "CC BY-SA 4.0 or CC0", f"{HF}/datasets/sil-ai/bloom-speech",
                   "Read speech aligned with the text of illustrated books from bloomlibrary.org (SIL); hours measured from its audio"),
    "bloom_restricted": ("Bloom Library (non-commercial)", "CC BY-NC and similar", f"{HF}/datasets/sil-ai/bloom-speech",
                         "Read speech aligned with the text of illustrated books from bloomlibrary.org (SIL); hours measured from its audio"),
}
OPENSLR = {"read": ("OpenSLR read speech", "CC BY-SA 4.0 and other open licences"),
           "non-commercial": ("OpenSLR read speech (non-commercial)", "CC BY-NC-SA 4.0"),
           "broadcast": ("OpenSLR broadcast", "MIT"), "spontaneous": ("OpenSLR spontaneous", "CC BY 4.0")}
# WAXAL's folder names that aren't ISO 639-3 codes, and its languages under CC BY (University of Ghana's);
# the rest are CC BY-SA 4.0
WAXAL_CODES = {"bau": "bci"}  # Baoulé
WAXAL_CC_BY = {"aka", "fat", "twi", "bau", "bci", "ewe"}


def get(url: str) -> str:
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read().decode("utf-8")


def waxal_configs() -> set[str]:
    """The TTS languages WAXAL's card lists (some folders hold recordings it hasn't released)."""
    return set(re.findall(r"^\s*- config_name: (\w+)_tts\s*$", get(f"{HF}/datasets/{WAXAL}/raw/main/README.md"), re.M))


def madlad_audit() -> dict[str, tuple[int, str]]:
    """label -> (documents, the auditors' notes) for languages MADLAD keeps."""
    text = get(f"{HF}/datasets/{MADLAD}/raw/main/README.md").split("## Detailed notes from the audit")[1]
    rows, cur = [], None  # a label can appear twice (kept once, removed once): the kept row counts
    for line in text.split("\n"):
        m = re.match(r"\|\s*(\S+)\s*\|(.*?)\|\s*(\d+)\s*\|\s*(\S.*?)\s*\|", line)
        if m:
            cur = [m.group(1), int(m.group(3)), m.group(2).strip(), m.group(4)]
            rows.append(cur)
            continue
        m = re.match(r":\s*:(.*?):", line)
        if m and cur:
            cur[2] += " " + m.group(1).strip()
    return {k: (n, note) for k, n, note, d in rows if d.startswith("keep")}


def jobs() -> None:
    print(json.dumps({"include": [{"job": j, "shard": i, "of": n} for j, n in SHARDS.items() for i in range(n)]}))


def run(job: str, shard: str) -> None:
    if job == "omnilingual":
        cmd = [sys.executable, "tools/audio_hours.py", OMNI, "data", "--shard", shard]
    elif job == "waxal_tts":
        cmd = [sys.executable, "tools/audio_hours.py", WAXAL, "data/TTS", "--shard", shard]
    elif job == "openslr":
        with (CONFIG / "openslr_archives.csv").open(encoding="utf-8") as f:
            urls = [r["url"] for r in csv.DictReader(l for l in f if not l.startswith("#"))]
        cmd = [sys.executable, "tools/audio_hours.py", "--urls", *urls, "--shard", shard]
    elif job == "bloom":
        cmd = [sys.executable, "tools/bloom_counts.py"]
    elif job == "indicvoices":
        cmd = [sys.executable, "tools/audio_hours.py", INDICVOICES, "", "--ranged", "--shard", shard]
    elif job == "madlad":
        labels = [k for k, (n, _) in madlad_audit().items() if n < 200_000]
        cmd = [sys.executable, "tools/text_words.py", MADLAD, *labels, "--shard", shard]
    else:
        sys.exit(f"unknown job {job}")
    subprocess.run(cmd, cwd=ROOT, check=True)


def read_lines(folder: Path) -> list[list[str]]:
    out = []
    for p in sorted(folder.rglob("*.tsv")):
        out += [l.rstrip("\n").split("\t") for l in p.open(encoding="utf-8") if l.startswith(("HOURS\t", "WORDS\t", "BLOOM\t"))]
    return out


def guard(old: dict[str, dict[str, float]], new: dict[str, dict[str, float]], force: bool) -> None:
    problems = []
    for ds, before in old.items():
        after = new.get(ds, {})
        tb, ta = sum(before.values()), sum(after.values())
        if tb and ta < 0.75 * tb:
            problems.append(f"{ds}: {tb:,.0f} -> {ta:,.0f}")
        lost = [c for c in before if c not in after]
        if len(lost) > 0.1 * len(before):
            problems.append(f"{ds}: lost {len(lost)} of {len(before)} languages ({', '.join(lost[:8])})")
    if problems and not force:
        sys.exit("not written, since:\n  " + "\n  ".join(problems))


def ingest(folder: Path, force: bool) -> None:
    codes = set(ltdi_codes())
    lines = read_lines(folder)
    hours: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))  # dataset -> code -> hours
    notes: dict[tuple[str, str], set[str]] = defaultdict(set)
    meta: dict = {}  # dataset, or (dataset, code) for OpenSLR -> (licence, url, note)

    seen = {}
    for kind, *rest in lines:
        if kind == "HOURS":
            seen[(rest[0], rest[1])] = float(rest[3])  # a file measured twice counts once
    active = waxal_configs() if any(k[0] == WAXAL for k in seen) else set()
    with (CONFIG / "openslr_archives.csv").open(encoding="utf-8") as f:
        slr = {r["url"]: r for r in csv.DictReader(l for l in f if not l.startswith("#"))}
    for (src, path), secs in seen.items():
        if src == OMNI:
            name, lic, url, note = ROWS["omnilingual"]
            code = to_ltdi(re.match(r"data/([a-z]+)_", path).group(1))
        elif src == WAXAL:
            lang = re.match(r"data/TTS/([a-z]+)/", path).group(1)
            if lang not in active:
                continue
            name, lic, url, note = ROWS["waxal_tts"]
            code = to_ltdi(WAXAL_CODES.get(lang, lang))
            if code in codes:  # each provider's licence, as WAXAL's card lists them
                meta[(name, code)] = ("CC BY 4.0" if lang in WAXAL_CC_BY else "CC BY-SA 4.0", url, note)
        elif src == INDICVOICES:
            name, lic, url, note = ROWS["indicvoices"]
            code = resolve(path.split("/")[0].title())
        elif src in slr:
            a = slr[src]
            (name, lic), code = OPENSLR[a["kind"]], a["language"]
            if code in codes and secs > 0:
                notes[(name, code)].add(int(a["slr"]))
                ns = sorted(notes[(name, code)])
                meta[(name, code)] = (lic, f"https://www.openslr.org/{ns[0]}/",
                                      f"{', '.join(f'SLR{n}' for n in ns)}; hours measured from the downloads")
            url = note = ""
        else:
            continue
        if code in codes and secs > 0:
            hours[name][code] += secs / 3600
            meta.setdefault(name, (lic, url, note))
    for kind, *rest in lines:
        if kind == "BLOOM" and rest[0] == "speech":
            _, lang, lic_kind, _, secs = rest
            code = to_ltdi(lang)
            name, lic, url, note = ROWS["bloom_open" if lic_kind == "open" else "bloom_restricted"]
            if code in codes:
                hours[name][code] += float(secs) / 3600
                meta[name] = (lic, url, note)

    with (CONFIG / "speech_datasets.csv").open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    fields = list(rows[0])
    # IndicVoices' measured hours replace the paper's first-release figures
    keep = [r for r in rows if not (r["dataset"] in hours and (r.get("basis") == "measured" or r["dataset"] == "IndicVoices"))]
    old = defaultdict(dict)
    for r in rows:
        if r["dataset"] in hours and r.get("basis") == "measured":
            old[r["dataset"]][r["language"]] = float(r["hours"])
    new = {ds: {c: h for c, h in by.items() if h >= 0.05} for ds, by in hours.items()}
    guard(old, new, force)
    for ds, by in sorted(new.items()):
        for code, h in sorted(by.items()):
            lic, url, note = meta.get((ds, code)) or meta[ds]
            keep.append({"dataset": ds, "language": code, "hours": f"{h:.1f}", "licence": lic, "url": url, "note": note, "basis": "measured"})
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=fields, lineterminator="\n")
    w.writeheader()
    w.writerows(keep)
    (CONFIG / "speech_datasets.csv").write_text(out.getvalue(), encoding="utf-8")
    print(f"speech_datasets.csv: {sum(len(v) for v in new.values())} measured rows in {len(new)} datasets")

    words = [rest for kind, *rest in lines if kind == "WORDS"]
    if words:
        ingest_madlad(words, codes, force)


BAD = re.compile(r"wrong language|consider removing|almost all|lorem|majority noise", re.I)


def bible_share(note: str) -> float:
    n = note.lower().strip()
    if n.startswith(("ok bible", "ok jw", "bible", "all bible", "all jw")) or re.fullmatch(r"(ok|good|fine)?[ ;,]*(bible|jw|bible and jw|bible \+ jw|jw\.?)\.?", n):
        return 1.0
    return 0.5 if re.search(r"bible|jw|relig", n) else 0.0


def ingest_madlad(words: list[list[str]], codes: set[str], force: bool) -> None:
    audit = madlad_audit()
    path = CONFIG / "madlad_words.csv"
    with path.open(encoding="utf-8") as f:
        head = [l for l in f if l.startswith("#")]
    with path.open(encoding="utf-8") as f:
        old_rows = list(csv.DictReader(l for l in f if not l.startswith("#")))
    out = []
    for _, label, docs, n in words:
        code, note = to_ltdi(label.replace("_", "-")), audit.get(label, (0, ""))[1]
        if code in codes and not BAD.search(note) and int(n):
            out.append({"label": label, "language": code, "documents": docs, "words": n,
                        "bible_share": bible_share(note), "audit_note": note})
    guard({"MADLAD-400": {r["label"]: float(r["words"]) for r in old_rows}},
          {"MADLAD-400": {r["label"]: float(r["words"]) for r in out}}, force)
    buf = io.StringIO()
    buf.write("".join(head))
    w = csv.DictWriter(buf, fieldnames=list(out[0]), lineterminator="\n")
    w.writeheader()
    w.writerows(sorted(out, key=lambda r: (r["language"], r["label"])))
    path.write_text(buf.getvalue(), encoding="utf-8")
    print(f"madlad_words.csv: {len(out)} languages")


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("jobs")
    r = sub.add_parser("run")
    r.add_argument("job")
    r.add_argument("shard")
    i = sub.add_parser("ingest")
    i.add_argument("folder", type=Path)
    i.add_argument("--force", action="store_true")
    a = ap.parse_args()
    if a.cmd == "jobs":
        jobs()
    elif a.cmd == "run":
        run(a.job, a.shard)
    else:
        ingest(a.folder, a.force)


if __name__ == "__main__":
    main()
