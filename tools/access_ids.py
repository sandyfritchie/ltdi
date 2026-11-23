"""Where to get each dataset the Index counts, language by language: the repository, the subset (a
Hugging Face config or folder, a Common Voice locale, a download URL) and a page to start from. Written
to data/dataset_access.csv for the database download (ltdi/export.py), so a builder can go from "every
CC BY speech dataset for Hausa" to the files. Run monthly after the collectors:

    python tools/access_ids.py

Columns: indicator, language, repository, subset, url. repository is "huggingface:<owner>/<name>",
"commonvoice", "openslr", "mozilladatacollective", or a site; subset is what that repository calls the
language (several, separated by spaces, where a language has more than one).
"""

from __future__ import annotations

import csv
import json
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ltdi import CONFIG, DATA  # noqa: E402
from ltdi.collectors import common_voice, fineweb2, speech  # noqa: E402
from ltdi.collectors._common import ltdi_codes  # noqa: E402
from ltdi.crosswalk import to_ltdi  # noqa: E402
from ltdi.http import fetch_json, fetch_text  # noqa: E402

HF = "https://huggingface.co"
OUT = DATA / "dataset_access.csv"


def hf_configs(repo: str) -> list[str]:
    req = urllib.request.Request(f"{HF}/api/datasets/{repo}", headers={"User-Agent": "ltdi-collector/0.1 (+https://github.com/sandyfritchie/ltdi)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.load(r)
    return [c["config_name"] for c in (d.get("cardData") or {}).get("configs") or []]


def name_codes() -> dict[str, list[str]]:
    """Lower-case language name (and other names) -> codes, for repositories that name their subsets."""
    out = defaultdict(list)
    for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8")):
        for n in [l.get("name"), *(l.get("alt_names") or [])]:
            if n and l["code"] not in out[n.lower()]:
                out[n.lower()].append(l["code"])
    return out


def counted() -> dict[str, set[str]]:
    """indicator -> the languages it has hours for, so a subset named by language matches among those."""
    out = defaultdict(set)
    with (DATA / "records" / "speech.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["language"] != "*" and float(r["value"] or 0) > 0:
                out[r["indicator"]].add(r["language"])
    return out


def main() -> None:
    codes = set(ltdi_codes())
    names, has = name_codes(), counted()

    def by_name(ind: str, label: str) -> str | None:
        cands = names.get(label.lower().replace("_", " "), [])
        among = [c for c in cands if c in has.get(ind, set())]
        return (among or cands or [None])[0]
    rows: dict[tuple[str, str], dict] = {}
    subs: dict[tuple[str, str], list[str]] = defaultdict(list)

    def add(ind, label, repo, url, code=None):
        code = code or to_ltdi(label) or by_name(ind, label)
        if code in codes:
            rows.setdefault((ind, code), {"indicator": ind, "language": code, "repository": repo, "url": url})
            if label not in subs[(ind, code)]:
                subs[(ind, code)].append(label)

    # Common Voice: locales
    for loc in fetch_json(common_voice.URL)["locales"]:
        add("cv_validated_hours", loc, "commonvoice", "https://commonvoice.mozilla.org/en/datasets")
    for loc in fetch_json(common_voice.SPS_URL)["locales"]:
        add("cv_spontaneous_hours", loc, "commonvoice", "https://commonvoice.mozilla.org/en/datasets")
    # Hugging Face configs named by locale, code or language name
    for ind, repo, keep in [
        ("speech_fleurs", "google/fleurs", lambda c: c != "all"),
        ("speech_indicvoices", "ai4bharat/IndicVoices", None),
        ("speech_kathbath", "ai4bharat/Kathbath", None),
        ("speech_shrutilipi", "ai4bharat/Shrutilipi", None),
        ("speech_vaani", "ARTPARK-IISc/Vaani", None),
        ("speech_multilingual_librispeech", "facebook/multilingual_librispeech", None),
        ("speech_voxpopuli", "facebook/voxpopuli", lambda c: "_" not in c),
        ("speech_swivuriso_african_next_voices", "dsfsi-anv/za-african-next-voices", None),
        ("speech_waxal", "google/WaxalNLP", lambda c: c.endswith("_asr")),
        ("speech_waxal_tts", "google/WaxalNLP", lambda c: c.endswith("_tts")),
    ]:
        try:
            cfgs = hf_configs(repo)
        except Exception as e:  # noqa: BLE001
            print(f"{repo}: {e}", file=sys.stderr)
            continue
        for c in cfgs:
            if keep and not keep(c):
                continue
            label = re.sub(r"_(asr|tts)$", "", c.split("/")[-1])  # Vaani's "audio/Hindi"
            label = {"bau": "bci"}.get(label, label) if repo == "google/WaxalNLP" else label  # WAXAL's Baoulé folder
            code = to_ltdi(label) or to_ltdi(label.split("_")[0]) or by_name(ind, label)
            add(ind, c, f"huggingface:{repo}", f"{HF}/datasets/{repo}", code)
    # NaijaVoices: a gated repository, each language in three batches
    for name, code in [("hausa", "ha"), ("igbo", "ig"), ("yoruba", "yo")]:
        add("speech_naijavoices", " ".join(f"{name}-batch-{i}" for i in range(3)), "huggingface:naijavoices/naijavoices-dataset",
            f"{HF}/datasets/naijavoices/naijavoices-dataset", code)
    # Kenya's African Next Voices: one repository per language; RobotsMali's Bambara
    for name, code in [("Dholuo", "luo"), ("kikuyu", "ki"), ("Kalenjin", "niq"), ("Kalenjin", "sgc"), ("Maasai", "mas"), ("Somali", "so")]:
        for ind in ("speech_afrivoices_ke_african_next_voices", "speech_afrivoices_ke_scripted"):
            add(ind, "", f"huggingface:Anv-ke/{name}", f"{HF}/datasets/Anv-ke/{name}", code)
    add("speech_african_next_voices_bambara", "human-corrected", "huggingface:RobotsMali/afvoices", f"{HF}/datasets/RobotsMali/afvoices", "bm")
    # YODAS2: the subsets with uploaders' subtitles (0xx)
    for subset in re.findall(r"'(\w+)':\s*\d+", fetch_text(speech.YODAS_META)):
        if re.fullmatch(r"[a-z]{2,3}0\d\d", subset):
            add("speech_yodas", subset, "huggingface:espnet/yodas2", f"{HF}/datasets/espnet/yodas2", to_ltdi(subset[:-3]))
    # Folders: Omnilingual (from the speech datasets measured), FineWeb-2 and MADLAD-400
    with (CONFIG / "speech_datasets.csv").open(encoding="utf-8") as f:
        sd = list(csv.DictReader(f))
    req = urllib.request.Request(f"{HF}/api/datasets/facebook/omnilingual-asr-corpus/tree/main/data",
                                 headers={"User-Agent": "ltdi-collector/0.1 (+https://github.com/sandyfritchie/ltdi)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        for x in json.load(r):
            folder = x["path"].split("/")[-1]
            add("speech_omnilingual_asr_corpus", folder, "huggingface:facebook/omnilingual-asr-corpus",
                f"{HF}/datasets/facebook/omnilingual-asr-corpus", to_ltdi(folder.split("_")[0]))
    for r in csv.DictReader(fetch_text(fineweb2.URL).splitlines()):
        if r["split"] == "train" and not r["subset"].endswith("_removed"):
            add("web_text_fineweb2", r["subset"], "huggingface:HuggingFaceFW/fineweb-2", f"{HF}/datasets/HuggingFaceFW/fineweb-2",
                to_ltdi(r["subset"].split("_")[0]) if "_" in r["subset"] else None)
    with (CONFIG / "madlad_words.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(l for l in f if not l.startswith("#")):
            add("web_text_madlad", r["label"], "huggingface:allenai/MADLAD-400", f"{HF}/datasets/allenai/MADLAD-400", r["language"])
    # Bloom Library: its own language codes
    iso3 = {l["code"]: l.get("iso_639_3") or l["code"] for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))}
    for r in sd:
        if r["dataset"].startswith("Bloom Library"):  # its configs are ISO 639-3 codes
            ind = "speech_bloom_library" + ("_non_commercial" if "non-commercial" in r["dataset"] else "")
            add(ind, iso3.get(r["language"], ""), "huggingface:sil-ai/bloom-speech", f"{HF}/datasets/sil-ai/bloom-speech", r["language"])
    # OpenSLR: the downloads, per kind of speech
    kinds = {"read": "speech_openslr_read_speech", "non-commercial": "speech_openslr_read_speech_non_commercial",
             "broadcast": "speech_openslr_broadcast", "spontaneous": "speech_openslr_spontaneous"}
    with (CONFIG / "openslr_archives.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(l for l in f if not l.startswith("#")):
            add(kinds[r["kind"]], r["url"], "openslr", f"https://www.openslr.org/{r['slr']}/", r["language"])
    # The rest: the URL each dataset gives (speech_datasets.csv), per language
    for r in sd:
        ind = "speech_" + speech._slug(r["dataset"])
        if (ind, r["language"]) not in rows:
            repo = "huggingface:" + r["url"].split("/datasets/")[-1].strip("/") if "huggingface.co/datasets/" in r["url"] else re.sub(r"^https?://(www\.)?", "", r["url"]).split("/")[0]
            add(ind, "", repo, r["url"], r["language"])

    out = []
    for key, row in sorted(rows.items()):
        out.append({**row, "subset": " ".join(s for s in subs[key] if s)})
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["indicator", "language", "repository", "subset", "url"], lineterminator="\n")
        w.writeheader()
        w.writerows(out)
    by = defaultdict(int)
    for r in out:
        by[r["indicator"]] += 1
    print(f"wrote {OUT.relative_to(ROOT)}: {len(out)} rows; " + ", ".join(f"{k} {v}" for k, v in sorted(by.items())))


if __name__ == "__main__":
    main()
