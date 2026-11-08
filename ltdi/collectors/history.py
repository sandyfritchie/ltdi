"""History: which languages had each kind of support at the end of each half-year.

Sources with a public history:
  Common Voice     every release's per-language stats (github.com/common-voice/cv-dataset)
  Unicode CLDR     every release's modern-coverage locales (cldr-json tags; dates from npm)
  DeepL            git history of its docs' language table (github.com/DeepLcom/api-docs), from May 2025
  Dated releases   NLLB-200 and FLORES-200 (July 2022), Whisper (September 2022), Belebele (August 2023):
                   languages counted from the release year, using today's lists

Run:  python -m ltdi.collectors history     (clones two repos into .cache; needs git)
Writes data/history.csv: language, series, period (YYYY-06 or YYYY-12), value (1 or 0), source.
"""

from __future__ import annotations

import csv
import json
import re
import subprocess
from pathlib import Path

from .. import CACHE, DATA
from ..crosswalk import to_ltdi
from ..http import fetch_json, fetch_text
from ._common import ltdi_codes

PERIODS = [f"{y}-{m}" for y in range(2019, 2027) for m in ("06", "12")]
SERIES = {
    "cv_10h": "At least 10 hours of open transcribed speech (Common Voice)",
    "cldr_modern": "Full locale data (CLDR modern coverage)",
    "deepl": "Commercial translation (DeepL)",
    "open_mt": "Open translation model (NLLB-200)",
    "open_asr": "Open speech recognition model (Whisper)",
    "reading_bench": "Reading-comprehension benchmark (Belebele)",
}
DATED = {"open_mt": ("mt_open_nllb", "2022-07"), "open_asr": ("asr_open_whisper", "2022-09"),
         "reading_bench": ("belebele", "2023-08")}


def _clone(url: str, name: str, *args: str) -> Path:
    path = CACHE / name
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "-q", *args, url, str(path)], check=True)
    return path


def common_voice() -> list[tuple[str, set[str]]]:
    repo = _clone("https://github.com/common-voice/cv-dataset", "cv-dataset", "--depth", "1")
    out = []
    for f in (repo / "datasets" / "scripted-speech").glob("cv-corpus-*.json"):
        if "delta" in f.name or "singleword" in f.name:
            continue
        d = json.loads(f.read_text())
        hours: dict[str, float] = {}
        for loc, v in d["locales"].items():
            h = v.get("validHrs")
            if h is None and v.get("validDurationSecs") is not None:
                h = v["validDurationSecs"] / 3600
            if h is None and v.get("duration") and v.get("clips"):  # early releases: estimate from clip counts
                h = v["duration"] / 3.6e6 * v.get("buckets", {}).get("validated", 0) / v["clips"]
            code = to_ltdi(loc)
            if code and h:
                hours[code] = hours.get(code, 0) + h
        m = re.search(r"(\d{4}-\d\d-\d\d)", f.name)
        when = (d.get("date") or (m.group(1) if m else ""))[:10]
        if when:
            out.append((when, {c for c, h in hours.items() if h >= 10}))
    return out


def cldr() -> list[tuple[str, set[str]]]:
    dates = fetch_json("https://registry.npmjs.org/cldr-core")["time"]
    out = []
    for version, when in dates.items():
        if not re.fullmatch(r"\d+\.0\.0", version) or int(version.split(".")[0]) < 36:
            continue
        base = f"https://raw.githubusercontent.com/unicode-org/cldr-json/{version}/cldr-json/cldr-core"
        try:
            levels = fetch_json(f"{base}/coverageLevels.json")["effectiveCoverageLevels"]
            modern = [loc for loc, lv in levels.items() if lv == "modern"]
        except Exception:
            try:
                modern = fetch_json(f"{base}/availableLocales.json")["availableLocales"]["modern"]
            except Exception:
                continue
        out.append((when[:10], {c for c in (to_ltdi(m) for m in modern) if c}))
    return out


def deepl() -> list[tuple[str, set[str]]]:
    repo = _clone("https://github.com/DeepLcom/api-docs", "deepl-api-docs", "--filter=blob:none")
    langs = json.loads((DATA / "languages.json").read_text(encoding="utf-8"))
    names = {l["code"]: [l["name"].split()[-1] if l["code"] == "cmn" else l["name"]] for l in langs}
    names["cmn"] = ["Chinese"]
    names["bn"] = ["Bengali", "Bangla"]
    files = ["snippets/language-table.jsx", "docs/getting-started/supported-languages.mdx"]
    log = subprocess.run(["git", "-C", str(repo), "log", "--format=%H %ad", "--date=short", "--", *files],
                         capture_output=True, text=True, check=True).stdout.split("\n")
    out = []
    for line in filter(None, log):
        sha, day = line.split()
        text = ""
        for f in files:
            r = subprocess.run(["git", "-C", str(repo), "show", f"{sha}:{f}"], capture_output=True, text=True)
            text += r.stdout if r.returncode == 0 else ""
        if "name: '" in text:  # the generated table: count only rows available for translation
            rows = re.findall(r"\{\s*code:\s*'[^']+',\s*name:\s*'([^']+)'[^}]*translation:\s*true", text)
            text = "\n".join(rows)
        out.append((day, {c for c, ns in names.items() if any(re.search(rf"\b{re.escape(n)}\b", text) for n in ns)}))
    return out


def collect():
    from ..records import Record  # noqa: F401  (history isn't per-language records; see main)
    return []


def _end(period: str) -> str:
    return period + ("-30" if period.endswith("-06") else "-31")


def main() -> None:
    codes = ltdi_codes()
    rows = []
    for series, snaps, source in (("cv_10h", common_voice(), "Common Voice releases"),
                                  ("cldr_modern", cldr(), "Unicode CLDR releases"),
                                  ("deepl", deepl(), "DeepL docs history")):
        snaps.sort()
        for period in PERIODS:
            before = [have for when, have in snaps if when <= _end(period)]
            if before:
                rows += [(c, series, period, int(c in before[-1]), source) for c in codes]
    current = {}
    for f in (DATA / "records").glob("*.csv"):
        for r in csv.DictReader(f.open(encoding="utf-8")):
            current[(r["language"], r["indicator"])] = float(r["value"])
    for series, (ind, since) in DATED.items():
        for period in PERIODS:
            if _end(period) >= since:
                rows += [(c, series, period, int(bool(current.get((c, ind)))), f"Released {since}") for c in codes]
    with (DATA / "history.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["language", "series", "period", "value", "source"])
        w.writerows(sorted(rows))
    (DATA / "history_series.json").write_text(json.dumps(SERIES, indent=1), encoding="utf-8")
    print(f"history: {len(rows)} rows")


if __name__ == "__main__":
    main()
